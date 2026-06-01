"""Derive day-level attendance metrics from raw events.

Pure functions — no DB, no IO. Used by both `/api/attendance/today` (M6) and
the monthly Excel export (M7).

Key design:
  * Schedule lives on the employee row (`expected_arrival_time`,
    `min_work_hours_per_day`). Derived metrics are computed on-read so
    schedule edits propagate retroactively to dashboard + reports.
  * Cross-midnight shifts: events between 00:00 and `shift_day_cutoff_hour`
    (default 04:00) count toward the *previous* calendar day. A cook who
    arrives at 22:00 Mon and leaves at 03:30 Tue both belong to Mon's row.
  * Stored `event_ts` is UTC; comparisons use `restaurant_tz`.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time as dtime, timedelta
from typing import Iterable
from zoneinfo import ZoneInfo


@dataclass(frozen=True)
class EmployeeSchedule:
    expected_arrival_time: str  # "HH:MM"
    min_work_hours_per_day: float


@dataclass(frozen=True)
class AttendanceEvent:
    event_type: str  # 'came' | 'went'
    event_ts_utc: datetime  # naive UTC (matches SQLite datetime('now'))


@dataclass(frozen=True)
class DayMetrics:
    is_present: bool
    came_at: datetime | None  # local
    went_at: datetime | None  # local
    worked_hours: float
    late_minutes: int
    early_leave_minutes: int


def _to_local(ts_utc: datetime, tz: ZoneInfo) -> datetime:
    """SQLite stores `datetime('now')` as naive UTC — attach UTC, convert, drop tz."""
    if ts_utc.tzinfo is None:
        ts_utc = ts_utc.replace(tzinfo=ZoneInfo("UTC"))
    return ts_utc.astimezone(tz).replace(tzinfo=None)


def shift_day_for(local_ts: datetime, cutoff_hour: int) -> date:
    """Return the "shift day" a local timestamp belongs to.

    Events before `cutoff_hour` count toward the previous calendar day.
    """
    if local_ts.hour < cutoff_hour:
        return (local_ts - timedelta(days=1)).date()
    return local_ts.date()


def _parse_hhmm(s: str) -> dtime:
    h, m = s.split(":")
    return dtime(int(h), int(m))


def derive_day_metrics(
    schedule: EmployeeSchedule,
    events_for_day: Iterable[AttendanceEvent],
    *,
    tz_name: str,
    shift_day_cutoff_hour: int = 4,
    target_day: date | None = None,
) -> DayMetrics:
    """Compute the metrics for a single (employee, shift-day) cell.

    `events_for_day` must contain events that have already been bucketed into
    the same shift day (caller's responsibility). Caller may also filter to
    a target_day for sanity.
    """
    tz = ZoneInfo(tz_name)
    sorted_events = sorted(
        events_for_day, key=lambda e: e.event_ts_utc
    )

    came: datetime | None = None
    went: datetime | None = None
    for ev in sorted_events:
        local = _to_local(ev.event_ts_utc, tz)
        if ev.event_type == "came" and came is None:
            came = local
        elif ev.event_type == "went":
            went = local  # last "went" wins

    if came is None and went is None:
        return DayMetrics(
            is_present=False,
            came_at=None,
            went_at=None,
            worked_hours=0.0,
            late_minutes=0,
            early_leave_minutes=0,
        )

    expected = _parse_hhmm(schedule.expected_arrival_time)

    late_minutes = 0
    if came is not None:
        expected_dt = datetime.combine(came.date(), expected)
        diff = (came - expected_dt).total_seconds() / 60.0
        late_minutes = max(0, int(round(diff)))

    worked_hours = 0.0
    if came is not None and went is not None and went > came:
        worked_hours = (went - came).total_seconds() / 3600.0

    early_leave_minutes = 0
    if came is not None and went is not None:
        deficit = schedule.min_work_hours_per_day - worked_hours
        if deficit > 0:
            early_leave_minutes = int(round(deficit * 60))

    return DayMetrics(
        is_present=came is not None,
        came_at=came,
        went_at=went,
        worked_hours=round(worked_hours, 2),
        late_minutes=late_minutes,
        early_leave_minutes=early_leave_minutes,
    )


def bucket_events_by_shift_day(
    events: Iterable[AttendanceEvent],
    *,
    tz_name: str,
    cutoff_hour: int = 4,
) -> dict[date, list[AttendanceEvent]]:
    """Group events into shift-day buckets keyed by local date."""
    tz = ZoneInfo(tz_name)
    out: dict[date, list[AttendanceEvent]] = {}
    for ev in events:
        local = _to_local(ev.event_ts_utc, tz)
        day = shift_day_for(local, cutoff_hour)
        out.setdefault(day, []).append(ev)
    return out
