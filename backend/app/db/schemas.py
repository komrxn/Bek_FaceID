"""Pydantic v2 request/response schemas — the API surface.

Models grow milestone-by-milestone:
  M1 → RecognizeStatus, EmployeePublic (minimal), RecognizeResponse
  M2 → EmployeeCreate, EmployeeUpdate, EmployeeFull
  M3 → AuthLoginRequest, AuthMeResponse
  M4 → AttendanceMarkRequest/Response (gains pending_event_token, last_event_today)
  M5 → RecognizeResponse gains anti_spoof_score
  M6 → AttendanceTodayRow, AttendanceFilter
  M7 → ExportRequest

This file is intentionally the canonical place — never duplicate response
shapes in handlers; import these. Frontend mirrors via `frontend/src/lib/zod.ts`.
"""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


class RecognizeStatus(str, Enum):
    recognized = "recognized"
    unknown = "unknown"
    no_face = "no_face"
    low_quality = "low_quality"
    spoof = "spoof"  # M5 — anti-spoof rejected the frame


class EmployeePublic(BaseModel):
    """The minimal employee shape returned to the kiosk."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    full_name: str
    position: str
    photo_url: str | None = None


# ---- M2: admin-side employee schemas ----------------------------------------


DEPARTMENT_PATTERN = r"^(hall|kitchen|other)$"


class EmployeeListItem(BaseModel):
    """Row in the admin employees table."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    full_name: str
    position: str
    department: str
    phone: str | None
    photo_url: str | None
    is_active: bool
    embeddings_count: int


class EmployeeUpdate(BaseModel):
    """Partial update via PATCH /api/employees/{id}."""

    full_name: str | None = None
    position: str | None = None
    department: str | None = Field(
        None,
        pattern=DEPARTMENT_PATTERN,
        description="'hall' | 'kitchen' | 'other'",
    )
    phone: str | None = None
    is_active: bool | None = None


class EmployeeCreated(BaseModel):
    """Response shape for POST /api/employees and add-photos endpoint."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    full_name: str
    position: str
    department: str
    phone: str | None
    photo_url: str | None
    is_active: bool
    photo_quality_scores: list[float]  # per uploaded photo, in upload order


class LastEventToday(BaseModel):
    event_type: str  # 'came' | 'went'
    event_ts: str    # ISO-8601


class RecognizeResponse(BaseModel):
    """M4 envelope — adds debounce + pending token flow."""

    status: RecognizeStatus
    employee: EmployeePublic | None = None
    confidence: float = Field(0.0, ge=0.0, le=1.0)
    anti_spoof_score: float = Field(
        1.0, ge=0.0, le=1.0, description="real-prob; 1.0 = real, 0.0 = spoof"
    )
    can_mark_attendance: bool = False
    pending_event_token: str | None = None
    last_event_today: LastEventToday | None = None


# ---- M4: attendance mark schemas -------------------------------------------


class AttendanceMarkRequest(BaseModel):
    pending_event_token: str = Field(min_length=32, max_length=32)
    event_type: str = Field(pattern=r"^(came|went)$")


class AttendanceMarkResponse(BaseModel):
    event_id: int
    event_type: str
    event_ts: str


# ---- M6: dashboard schemas -------------------------------------------------


class AttendanceTodayRow(BaseModel):
    """One employee's view of "today" (shift-day)."""

    employee_id: int
    full_name: str
    position: str
    department: str
    photo_url: str | None
    is_active: bool
    is_present: bool
    came_at: str | None
    went_at: str | None
    worked_hours: float


class AttendanceTodayResponse(BaseModel):
    shift_day: str  # ISO date
    rows: list[AttendanceTodayRow]
    totals: dict[str, int]  # working_now, completed, absent


class AttendanceManualRequest(BaseModel):
    employee_id: int
    event_type: str = Field(pattern=r"^(came|went)$")
    event_ts: str  # ISO datetime (local naive interpreted in RESTAURANT_TZ)
    notes: str | None = None
