"""GET /api/export/xlsx — табель for accountant Зарина.

Two modes (mutually exclusive query params):
  ?month=YYYY-MM → full-month grid (Sheet 1) + per-employee summary (Sheet 2)
  ?day=YYYY-MM-DD → single day snapshot (one row per employee, same shape
                    as the dashboard's "Today" table)

Pulls the relevant attendance events, runs them through
`derive_day_metrics`, and streams the xlsx back. Admin-only.
"""

from __future__ import annotations

from datetime import date, datetime, time as dtime, timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_admin
from app.config import Settings, get_settings
from app.core.attendance_metrics import AttendanceEvent as MetricsEvent
from app.core.excel_report import EmployeeForReport, build_daily_xlsx, build_xlsx
from app.db import crud
from app.db.models import AttendanceEvent
from app.deps import get_db

router = APIRouter(prefix="/api/export", tags=["export"])


@router.get(
    "/xlsx",
    dependencies=[Depends(require_admin)],
    response_class=Response,
)
async def export_xlsx(
    month: str | None = Query(
        None, pattern=r"^\d{4}-\d{2}$", description="Monthly mode: YYYY-MM"
    ),
    day: str | None = Query(
        None,
        pattern=r"^\d{4}-\d{2}-\d{2}$",
        description="Daily mode: YYYY-MM-DD (RESTAURANT_TZ-local shift day)",
    ),
    session: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> Response:
    if (month is None) == (day is None):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Specify exactly one of `month` (YYYY-MM) or `day` (YYYY-MM-DD).",
        )

    tz = ZoneInfo(settings.restaurant_tz)

    # Tombstoned employees (renamed "[удалён] X" by hard-delete) must still
    # appear in historical reports — their events lived in the past months/days.
    employees = await crud.list_employees(session, include_tombstoned=True)

    if month is not None:
        try:
            year_s, month_s = month.split("-")
            year, mon = int(year_s), int(month_s)
            if not (1 <= mon <= 12):
                raise ValueError
        except ValueError as exc:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                "month must be YYYY-MM",
            ) from exc

        local_start = datetime(year, mon, 1, 0, 0)
        if mon == 12:
            local_end = datetime(year + 1, 1, 1, settings.shift_day_cutoff_hour)
        else:
            local_end = datetime(year, mon + 1, 1, settings.shift_day_cutoff_hour)
        utc_start = local_start.replace(tzinfo=tz).astimezone(ZoneInfo("UTC")).replace(tzinfo=None)
        utc_end = local_end.replace(tzinfo=tz).astimezone(ZoneInfo("UTC")).replace(tzinfo=None)

        events_res = await session.execute(
            select(AttendanceEvent)
            .where(AttendanceEvent.event_ts >= utc_start)
            .where(AttendanceEvent.event_ts < utc_end)
            .order_by(AttendanceEvent.event_ts.asc())
        )
        by_employee: dict[int, list[MetricsEvent]] = {}
        for ev in events_res.scalars().all():
            by_employee.setdefault(ev.employee_id, []).append(
                MetricsEvent(event_type=ev.event_type, event_ts_utc=ev.event_ts)
            )

        report_employees = [
            EmployeeForReport(
                id=e.id, full_name=e.full_name,
                position=e.position, department=e.department,
            )
            for e in employees
        ]
        xlsx_bytes = build_xlsx(
            employees=report_employees,
            events_by_employee=by_employee,
            year=year, month=mon,
            tz_name=settings.restaurant_tz,
            shift_day_cutoff_hour=settings.shift_day_cutoff_hour,
        )
        filename = f"Tabel_BEK_{year:04d}-{mon:02d}.xlsx"

    else:
        # Daily mode — `day` is set, `month` is None (validated above).
        try:
            target_day = date.fromisoformat(day)  # type: ignore[arg-type]
        except ValueError as exc:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY, f"day: {exc}"
            ) from exc

        cutoff = settings.shift_day_cutoff_hour
        start_local = datetime.combine(target_day, dtime(cutoff))
        end_local = start_local + timedelta(days=1)
        utc_start = start_local.replace(tzinfo=tz).astimezone(ZoneInfo("UTC")).replace(tzinfo=None)
        utc_end = end_local.replace(tzinfo=tz).astimezone(ZoneInfo("UTC")).replace(tzinfo=None)

        events_res = await session.execute(
            select(AttendanceEvent)
            .where(AttendanceEvent.event_ts >= utc_start)
            .where(AttendanceEvent.event_ts < utc_end)
            .order_by(AttendanceEvent.event_ts.asc())
        )
        by_employee = {}
        for ev in events_res.scalars().all():
            by_employee.setdefault(ev.employee_id, []).append(
                MetricsEvent(event_type=ev.event_type, event_ts_utc=ev.event_ts)
            )

        report_employees = [
            EmployeeForReport(
                id=e.id, full_name=e.full_name,
                position=e.position, department=e.department,
            )
            for e in employees
        ]
        xlsx_bytes = build_daily_xlsx(
            employees=report_employees,
            events_by_employee=by_employee,
            day=target_day,
            tz_name=settings.restaurant_tz,
            shift_day_cutoff_hour=settings.shift_day_cutoff_hour,
        )
        filename = f"Posescheniye_BEK_{target_day.isoformat()}.xlsx"

    return Response(
        content=xlsx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
