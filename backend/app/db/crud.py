"""Query helpers — keep handlers thin.

Each function takes an `AsyncSession` (caller-owned). Commits are caller's
responsibility unless explicitly noted. Tests stub these where needed.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Iterable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import AdminUser, AttendanceEvent, Employee, FaceEmbedding


# ---------------------------- Employees ----------------------------


async def list_employees(
    session: AsyncSession, *, only_active: bool = False
) -> list[Employee]:
    stmt = select(Employee).order_by(Employee.full_name.asc())
    if only_active:
        stmt = stmt.where(Employee.is_active == 1)
    res = await session.execute(stmt)
    return list(res.scalars().all())


async def get_employee(session: AsyncSession, employee_id: int) -> Employee | None:
    return await session.get(Employee, employee_id)


async def create_employee(
    session: AsyncSession,
    *,
    full_name: str,
    position: str,
    phone: str | None,
    expected_arrival_time: str,
    min_work_hours_per_day: float,
) -> Employee:
    emp = Employee(
        full_name=full_name,
        position=position,
        phone=phone,
        expected_arrival_time=expected_arrival_time,
        min_work_hours_per_day=min_work_hours_per_day,
        is_active=1,
    )
    session.add(emp)
    await session.flush()  # populate emp.id
    return emp


async def update_employee(
    session: AsyncSession, emp: Employee, **fields: object
) -> Employee:
    for k, v in fields.items():
        if v is not None:
            setattr(emp, k, v)
    await session.flush()
    return emp


async def deactivate_employee(session: AsyncSession, emp: Employee) -> Employee:
    emp.is_active = 0
    emp.deactivated_at = datetime.now(UTC).replace(tzinfo=None)
    await session.flush()
    return emp


# ---------------------------- Embeddings ----------------------------


async def add_embedding(
    session: AsyncSession,
    *,
    employee_id: int,
    embedding_blob: bytes,
    source_photo_path: str,
    quality_score: float | None,
) -> FaceEmbedding:
    row = FaceEmbedding(
        employee_id=employee_id,
        embedding=embedding_blob,
        source_photo_path=source_photo_path,
        quality_score=quality_score,
    )
    session.add(row)
    await session.flush()
    return row


async def iter_active_embeddings(
    session: AsyncSession,
) -> Iterable[tuple[int, bytes]]:
    """Yield (employee_id, embedding_bytes) for every embedding of every
    ACTIVE employee. Drives FAISS rebuild on startup and after deactivation.
    """
    stmt = (
        select(FaceEmbedding.employee_id, FaceEmbedding.embedding)
        .join(Employee, FaceEmbedding.employee_id == Employee.id)
        .where(Employee.is_active == 1)
        .order_by(FaceEmbedding.id.asc())
    )
    res = await session.execute(stmt)
    return [(row[0], row[1]) for row in res.all()]


# ---------------------------- Admin users ----------------------------


async def get_admin_by_username(
    session: AsyncSession, username: str
) -> AdminUser | None:
    res = await session.execute(
        select(AdminUser).where(AdminUser.username == username)
    )
    return res.scalar_one_or_none()


async def create_admin(
    session: AsyncSession, username: str, password_hash: str
) -> AdminUser:
    admin = AdminUser(username=username, password_hash=password_hash)
    session.add(admin)
    await session.flush()
    return admin


# ---------------------------- Attendance ----------------------------


async def create_attendance_event(
    session: AsyncSession,
    *,
    employee_id: int,
    event_type: str,
    confidence: float,
    anti_spoof_score: float,
    kiosk_id: str,
    source: str = "kiosk",
    frame_snapshot_path: str | None = None,
    notes: str | None = None,
) -> AttendanceEvent:
    event = AttendanceEvent(
        employee_id=employee_id,
        event_type=event_type,
        confidence=confidence,
        anti_spoof_score=anti_spoof_score,
        kiosk_id=kiosk_id,
        source=source,
        frame_snapshot_path=frame_snapshot_path,
        notes=notes,
    )
    session.add(event)
    await session.flush()
    return event
