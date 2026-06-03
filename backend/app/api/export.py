"""GET /api/export/xlsx — monthly табель for accountant Зарина.

Pulls all events for the month, runs them through `derive_day_metrics`
(shift-day bucketing handles cross-midnight shifts), and streams an xlsx
back. Admin-only.
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
from app.core.excel_report import EmployeeForReport, build_xlsx
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
    month: str = Query(..., pattern=r"^\d{4}-\d{2}$", description="YYYY-MM"),
    session: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> Response:
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

    # Compute the UTC window covering the entire local month + the shift-cutoff
    # buffer (so events at 03:00 on the 1st-of-next-month still belong to last
    # day's row).
    tz = ZoneInfo(settings.restaurant_tz)
    local_start = datetime(year, mon, 1, 0, 0)
    if mon == 12:
        local_end = datetime(year + 1, 1, 1, settings.shift_day_cutoff_hour)
    else:
        local_end = datetime(year, mon + 1, 1, settings.shift_day_cutoff_hour)
    utc_start = local_start.replace(tzinfo=tz).astimezone(ZoneInfo("UTC")).replace(tzinfo=None)
    utc_end = local_end.replace(tzinfo=tz).astimezone(ZoneInfo("UTC")).replace(tzinfo=None)

    employees = await crud.list_employees(session)  # active + inactive both
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
            id=e.id,
            full_name=e.full_name,
            position=e.position,
            department=e.department,
        )
        for e in employees
    ]

    xlsx_bytes = build_xlsx(
        employees=report_employees,
        events_by_employee=by_employee,
        year=year,
        month=mon,
        tz_name=settings.restaurant_tz,
        shift_day_cutoff_hour=settings.shift_day_cutoff_hour,
    )

    filename = f"Tabel_BEK_{year:04d}-{mon:02d}.xlsx"
    return Response(
        content=xlsx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
