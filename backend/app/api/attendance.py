"""Attendance event endpoints.

  POST /api/attendance/mark   — kiosk-side; consumes a pending_event_token.
  POST /api/attendance/manual — admin override.
  GET  /api/attendance/today  — admin dashboard.

`mark` is open (kiosk has no auth); the admin routes use `require_admin`.
"""

from __future__ import annotations

import logging
from datetime import date, datetime, time as dtime, timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_admin
from app.config import Settings, get_settings
from app.core.attendance_metrics import (
    AttendanceEvent as MetricsEvent,
    derive_day_metrics,
    shift_day_for,
)
from app.core.debounce import Debouncer
from app.core.pending_tokens import PendingTokens
from app.db import crud
from app.db.models import AttendanceEvent, Employee
from app.db.schemas import (
    AttendanceManualRequest,
    AttendanceMarkRequest,
    AttendanceMarkResponse,
    AttendanceTodayResponse,
    AttendanceTodayRow,
)
from app.deps import (
    get_db,
    get_debouncer,
    get_pending_tokens,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/attendance", tags=["attendance"])

DUPLICATE_WINDOW = timedelta(minutes=5)


async def _last_event_within(
    session: AsyncSession,
    *,
    employee_id: int,
    event_type: str,
    within: timedelta,
) -> AttendanceEvent | None:
    cutoff = datetime.utcnow() - within
    res = await session.execute(
        select(AttendanceEvent)
        .where(AttendanceEvent.employee_id == employee_id)
        .where(AttendanceEvent.event_type == event_type)
        .where(AttendanceEvent.event_ts >= cutoff)
        .order_by(desc(AttendanceEvent.event_ts))
        .limit(1)
    )
    return res.scalar_one_or_none()


@router.post("/mark", response_model=AttendanceMarkResponse)
async def mark(
    payload: AttendanceMarkRequest,
    request: Request,
    session: AsyncSession = Depends(get_db),
    pending: PendingTokens = Depends(get_pending_tokens),
    debouncer: Debouncer = Depends(get_debouncer),
    settings: Settings = Depends(get_settings),
) -> AttendanceMarkResponse:
    event = pending.consume(payload.pending_event_token)
    if event is None:
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="Сессия распознавания истекла. Попробуйте ещё раз.",
        )

    # Idempotency guard — no double-mark on accidental double-tap.
    recent = await _last_event_within(
        session,
        employee_id=event.employee_id,
        event_type=payload.event_type,
        within=DUPLICATE_WINDOW,
    )
    if recent is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "msg": f"Уже отмечено: «{payload.event_type}» в {recent.event_ts.strftime('%H:%M')}.",
                "event_id": recent.id,
            },
        )

    # Snapshot is best-effort — record the event even if snapshot save fails.
    # NOTE: we no longer have the raw JPEG here (recognize endpoint drops it
    # after decode). For M4 we mark without a snapshot path; M5 will route
    # the raw frame through the token so we can persist it.
    frame_snapshot_path: str | None = None

    row = await crud.create_attendance_event(
        session,
        employee_id=event.employee_id,
        event_type=payload.event_type,
        confidence=event.confidence,
        anti_spoof_score=event.anti_spoof_score,
        kiosk_id=event.kiosk_id,
        source="kiosk",
        frame_snapshot_path=frame_snapshot_path,
    )
    await session.commit()

    # Reset the debounce window so the same person doesn't double-fire while
    # walking away — next arrival starts a fresh count.
    debouncer.reset(event.kiosk_id)

    logger.info(
        "[attendance] mark emp_id=%s type=%s event_id=%s",
        event.employee_id,
        payload.event_type,
        row.id,
    )

    return AttendanceMarkResponse(
        event_id=row.id,
        event_type=row.event_type,
        event_ts=row.event_ts.isoformat(),
    )


# ---------------------------- admin endpoints ----------------------------


async def _today_shift_window_utc(settings: Settings) -> tuple[datetime, datetime]:
    """Compute the UTC time range that corresponds to "today's shift day"."""
    tz = ZoneInfo(settings.restaurant_tz)
    now_local = datetime.now(tz)
    today_local = shift_day_for(now_local.replace(tzinfo=None), settings.shift_day_cutoff_hour)
    cutoff = settings.shift_day_cutoff_hour
    # Shift day starts at cutoff:00 local on today, ends at cutoff:00 the next day.
    start_local = datetime.combine(today_local, dtime(cutoff))
    end_local = start_local + timedelta(days=1)
    start_utc = start_local.replace(tzinfo=tz).astimezone(ZoneInfo("UTC")).replace(tzinfo=None)
    end_utc = end_local.replace(tzinfo=tz).astimezone(ZoneInfo("UTC")).replace(tzinfo=None)
    return start_utc, end_utc


@router.get(
    "/today",
    response_model=AttendanceTodayResponse,
    dependencies=[Depends(require_admin)],
)
async def today(
    session: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> AttendanceTodayResponse:
    start_utc, end_utc = await _today_shift_window_utc(settings)
    employees = await crud.list_employees(session, only_active=True)
    events_res = await session.execute(
        select(AttendanceEvent)
        .where(AttendanceEvent.event_ts >= start_utc)
        .where(AttendanceEvent.event_ts < end_utc)
        .order_by(AttendanceEvent.event_ts.asc())
    )
    by_employee: dict[int, list[AttendanceEvent]] = {}
    for ev in events_res.scalars().all():
        by_employee.setdefault(ev.employee_id, []).append(ev)

    rows: list[AttendanceTodayRow] = []
    totals = {"working_now": 0, "completed": 0, "absent": 0}

    for emp in employees:
        emp_events = [
            MetricsEvent(event_type=e.event_type, event_ts_utc=e.event_ts)
            for e in by_employee.get(emp.id, [])
        ]
        metrics = derive_day_metrics(
            emp_events,
            tz_name=settings.restaurant_tz,
            shift_day_cutoff_hour=settings.shift_day_cutoff_hour,
        )

        if metrics.is_present and metrics.went_at is None:
            totals["working_now"] += 1
        elif metrics.is_present and metrics.went_at is not None:
            totals["completed"] += 1
        else:
            totals["absent"] += 1

        rows.append(
            AttendanceTodayRow(
                employee_id=emp.id,
                full_name=emp.full_name,
                position=emp.position,
                department=emp.department,
                photo_url=(
                    f"/static/employee_photos/{emp.photo_path}" if emp.photo_path else None
                ),
                is_active=bool(emp.is_active),
                is_present=metrics.is_present,
                came_at=metrics.came_at.isoformat() if metrics.came_at else None,
                went_at=metrics.went_at.isoformat() if metrics.went_at else None,
                worked_hours=metrics.worked_hours,
            )
        )

    # Ordering: working-now first (by name), completed second, absent last.
    def _sort_key(r: AttendanceTodayRow) -> tuple[int, str]:
        if r.is_present and r.went_at is None:
            return (0, r.full_name.lower())
        if r.is_present:
            return (1, r.full_name.lower())
        return (2, r.full_name.lower())

    rows.sort(key=_sort_key)
    today_local_date = (
        datetime.now(ZoneInfo(settings.restaurant_tz))
    ).date()
    return AttendanceTodayResponse(
        shift_day=today_local_date.isoformat(),
        rows=rows,
        totals=totals,
    )


@router.post(
    "/manual",
    response_model=AttendanceMarkResponse,
    dependencies=[Depends(require_admin)],
)
async def manual(
    payload: AttendanceManualRequest,
    session: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> AttendanceMarkResponse:
    emp = await crud.get_employee(session, payload.employee_id)
    if emp is None or not emp.is_active:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Сотрудник не найден.")

    # Interpret `event_ts` as RESTAURANT_TZ-local, store UTC.
    try:
        local = datetime.fromisoformat(payload.event_ts)
    except ValueError as exc:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"event_ts: {exc}",
        ) from exc

    tz = ZoneInfo(settings.restaurant_tz)
    if local.tzinfo is None:
        local = local.replace(tzinfo=tz)
    ts_utc = local.astimezone(ZoneInfo("UTC")).replace(tzinfo=None)

    row = AttendanceEvent(
        employee_id=emp.id,
        event_type=payload.event_type,
        event_ts=ts_utc,
        confidence=0.0,
        anti_spoof_score=1.0,
        kiosk_id="admin",
        source="manual",
        notes=payload.notes,
    )
    session.add(row)
    await session.commit()
    await session.refresh(row)

    return AttendanceMarkResponse(
        event_id=row.id,
        event_type=row.event_type,
        event_ts=row.event_ts.isoformat(),
    )
