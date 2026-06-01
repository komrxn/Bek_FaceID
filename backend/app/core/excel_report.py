"""Monthly attendance Excel ("Табель") for accountant Зарина.

Output structure:
  Sheet 1 — "Табель YYYY-MM"
    Header row:   employee | day 1 | day 2 | … | day N | TOTAL
    Each data cell: "П HH:MM\nУ HH:MM\nЧасы X.X" or "—" if absent.
    Conditional fill:
      green — on time, full hours
      amber — late (lateMinutes > 0)
      red   — early-leave (earlyLeaveMinutes > 0)
      gray  — absent
  Sheet 2 — "Сводка"
    Per employee: total hours, total late minutes, total early-leave minutes,
    days present, days absent.

Reuses `app.core.attendance_metrics.derive_day_metrics` so the dashboard
and the Excel always show the same numbers.
"""

from __future__ import annotations

import calendar
from collections.abc import Iterable
from datetime import date, datetime, time as dtime, timedelta
from io import BytesIO
from zoneinfo import ZoneInfo

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

from app.core.attendance_metrics import (
    AttendanceEvent as MetricsEvent,
    DayMetrics,
    EmployeeSchedule,
    derive_day_metrics,
    shift_day_for,
    bucket_events_by_shift_day,
)

# ---- Styling ---------------------------------------------------------------

PALETTE = {
    "header_bg":   "1F2937",
    "header_text": "FFFFFF",
    "fill_green":  "DCFCE7",
    "fill_amber":  "FEF3C7",
    "fill_red":    "FEE2E2",
    "fill_gray":   "F1F5F9",
    "text_green":  "166534",
    "text_amber":  "92400E",
    "text_red":    "991B1B",
    "text_gray":   "475569",
}

THIN = Side(style="thin", color="E5E7EB")
BORDER = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)

H_HEADER = Font(name="Calibri", size=11, bold=True, color=PALETTE["header_text"])
H_DAY = Font(name="Calibri", size=10, bold=True)
H_NAME = Font(name="Calibri", size=11, bold=True)
H_CELL = Font(name="Calibri", size=9)


def _fill(hex_color: str) -> PatternFill:
    return PatternFill("solid", fgColor=hex_color)


def _tone_for(metrics: DayMetrics) -> str:
    """Return one of 'green', 'amber', 'red', 'gray' for the cell color."""
    if not metrics.is_present:
        return "gray"
    if metrics.early_leave_minutes > 0:
        return "red"
    if metrics.late_minutes > 0:
        return "amber"
    return "green"


def _cell_text(metrics: DayMetrics) -> str:
    if not metrics.is_present:
        return "—"
    parts: list[str] = []
    if metrics.came_at is not None:
        parts.append(f"П {metrics.came_at.strftime('%H:%M')}")
    if metrics.went_at is not None:
        parts.append(f"У {metrics.went_at.strftime('%H:%M')}")
    if metrics.worked_hours > 0:
        parts.append(f"{metrics.worked_hours:.1f} ч.")
    return "\n".join(parts)


def _days_in_month(year: int, month: int) -> list[date]:
    _, ndays = calendar.monthrange(year, month)
    return [date(year, month, d) for d in range(1, ndays + 1)]


# ---- Data shapes -----------------------------------------------------------


class EmployeeForReport:
    __slots__ = ("id", "full_name", "position", "schedule")

    def __init__(
        self, *, id: int, full_name: str, position: str, schedule: EmployeeSchedule
    ) -> None:
        self.id = id
        self.full_name = full_name
        self.position = position
        self.schedule = schedule


# ---- Builder ---------------------------------------------------------------


def build_xlsx(
    *,
    employees: list[EmployeeForReport],
    events_by_employee: dict[int, Iterable[MetricsEvent]],
    year: int,
    month: int,
    tz_name: str,
    shift_day_cutoff_hour: int = 4,
) -> bytes:
    days = _days_in_month(year, month)

    wb = Workbook()
    ws = wb.active
    assert ws is not None
    ws.title = f"Табель {year:04d}-{month:02d}"

    # Frozen header row + employee column.
    ws.freeze_panes = "B2"

    # Header
    ws.cell(row=1, column=1, value="Сотрудник").font = H_HEADER
    ws.cell(row=1, column=1).fill = _fill(PALETTE["header_bg"])
    ws.cell(row=1, column=1).alignment = Alignment(horizontal="left", vertical="center")
    for i, d in enumerate(days, start=2):
        c = ws.cell(row=1, column=i, value=f"{d.day:02d}")
        c.font = H_HEADER
        c.fill = _fill(PALETTE["header_bg"])
        c.alignment = Alignment(horizontal="center", vertical="center")
        c.border = BORDER
    total_col = len(days) + 2
    tcell = ws.cell(row=1, column=total_col, value="Часов за месяц")
    tcell.font = H_HEADER
    tcell.fill = _fill(PALETTE["header_bg"])
    tcell.alignment = Alignment(horizontal="center", vertical="center")

    # Column widths
    ws.column_dimensions[get_column_letter(1)].width = 32
    for i in range(2, total_col):
        ws.column_dimensions[get_column_letter(i)].width = 12
    ws.column_dimensions[get_column_letter(total_col)].width = 16
    ws.row_dimensions[1].height = 24

    # Body
    summary: list[tuple[EmployeeForReport, dict[str, float | int]]] = []
    for row_idx, emp in enumerate(employees, start=2):
        ws.cell(row=row_idx, column=1, value=f"{emp.full_name}\n{emp.position}")
        name_cell = ws.cell(row=row_idx, column=1)
        name_cell.font = H_NAME
        name_cell.alignment = Alignment(vertical="center", wrap_text=True)
        name_cell.border = BORDER

        events = list(events_by_employee.get(emp.id, []))
        buckets = bucket_events_by_shift_day(
            events, tz_name=tz_name, cutoff_hour=shift_day_cutoff_hour
        )

        total_hours = 0.0
        total_late = 0
        total_early = 0
        days_present = 0

        for col_offset, d in enumerate(days):
            metrics = derive_day_metrics(
                emp.schedule,
                buckets.get(d, []),
                tz_name=tz_name,
                shift_day_cutoff_hour=shift_day_cutoff_hour,
                target_day=d,
            )
            tone = _tone_for(metrics)
            cell = ws.cell(row=row_idx, column=2 + col_offset, value=_cell_text(metrics))
            cell.font = H_CELL
            cell.alignment = Alignment(
                horizontal="center", vertical="center", wrap_text=True
            )
            cell.fill = _fill(PALETTE[f"fill_{tone}"])
            cell.border = BORDER

            total_hours += metrics.worked_hours
            total_late += metrics.late_minutes
            total_early += metrics.early_leave_minutes
            if metrics.is_present:
                days_present += 1

        total_cell = ws.cell(row=row_idx, column=total_col, value=round(total_hours, 1))
        total_cell.font = H_NAME
        total_cell.alignment = Alignment(horizontal="center", vertical="center")
        total_cell.border = BORDER

        summary.append(
            (
                emp,
                {
                    "total_hours": round(total_hours, 1),
                    "total_late_minutes": total_late,
                    "total_early_leave_minutes": total_early,
                    "days_present": days_present,
                    "days_total": len(days),
                },
            )
        )

        ws.row_dimensions[row_idx].height = 36

    # ---- Sheet 2 — summary -------------------------------------------------
    ws2 = wb.create_sheet("Сводка")
    headers = [
        "Сотрудник",
        "Должность",
        "Часов",
        "Дней присутствовал",
        "Опозданий, мин",
        "Раннего ухода, мин",
    ]
    for i, h in enumerate(headers, start=1):
        c = ws2.cell(row=1, column=i, value=h)
        c.font = H_HEADER
        c.fill = _fill(PALETTE["header_bg"])
        c.alignment = Alignment(horizontal="center", vertical="center")

    for row_idx, (emp, s) in enumerate(summary, start=2):
        ws2.cell(row=row_idx, column=1, value=emp.full_name).font = H_NAME
        ws2.cell(row=row_idx, column=2, value=emp.position).font = H_CELL
        ws2.cell(row=row_idx, column=3, value=s["total_hours"]).font = H_CELL
        ws2.cell(row=row_idx, column=4, value=f"{s['days_present']} / {s['days_total']}").font = H_CELL
        late_c = ws2.cell(row=row_idx, column=5, value=s["total_late_minutes"])
        late_c.font = H_CELL
        if s["total_late_minutes"] > 0:
            late_c.fill = _fill(PALETTE["fill_amber"])
        early_c = ws2.cell(row=row_idx, column=6, value=s["total_early_leave_minutes"])
        early_c.font = H_CELL
        if s["total_early_leave_minutes"] > 0:
            early_c.fill = _fill(PALETTE["fill_red"])

    for col, width in enumerate([32, 28, 12, 18, 16, 18], start=1):
        ws2.column_dimensions[get_column_letter(col)].width = width

    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf.getvalue()
