"""SQLAlchemy 2.0 ORM models — single source of truth for the schema.

See ~/.claude/plans/zesty-doodling-elephant.md §Database schema for the
canonical specification. Notable decisions:

  * `expected_arrival_time` is TEXT "HH:MM" in restaurant-local time
    (RESTAURANT_TZ, default Asia/Tashkent). `derive_day_metrics` (M6)
    composes it with the day's events.
  * `min_work_hours_per_day` is REAL hours (e.g. 8.0). Derived
    `early_leave_minutes = max(0, (min_hours - worked) * 60)` — never stored.
  * `attendance_events.notes` is added (vs the original plan) for the
    `POST /api/attendance/manual` flow where an admin overrides reality.
  * Embeddings are stored as BLOB (512 × float32 = 2048 bytes per row).
    For ~80 employees × 3 photos that's ~470 KB total — trivial.
  * Soft-delete on `employees` (is_active=False + deactivated_at) so
    attendance history remains attributable.
"""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    String,
    Text,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

if TYPE_CHECKING:  # pragma: no cover
    pass


class Base(DeclarativeBase):
    pass


class Employee(Base):
    __tablename__ = "employees"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    position: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(64), nullable=True)
    photo_path: Mapped[str | None] = mapped_column(
        String(512),
        nullable=True,
        comment="Relative path to primary display photo under data/employee_photos/",
    )
    expected_arrival_time: Mapped[str] = mapped_column(
        String(5),  # "HH:MM"
        nullable=False,
        default="09:00",
        server_default="09:00",
    )
    min_work_hours_per_day: Mapped[float] = mapped_column(
        Float,
        nullable=False,
        default=8.0,
        server_default="8.0",
    )
    is_active: Mapped[bool] = mapped_column(
        Integer,  # SQLite has no bool; 0/1
        nullable=False,
        default=1,
        server_default="1",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.current_timestamp()
    )
    deactivated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    embeddings: Mapped[list["FaceEmbedding"]] = relationship(
        back_populates="employee",
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    __table_args__ = (Index("ix_employees_active", "is_active"),)


class FaceEmbedding(Base):
    __tablename__ = "face_embeddings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    employee_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("employees.id", ondelete="CASCADE"),
        nullable=False,
    )
    embedding: Mapped[bytes] = mapped_column(
        LargeBinary,
        nullable=False,
        comment="512 × float32, L2-normalized — 2048 bytes",
    )
    source_photo_path: Mapped[str] = mapped_column(String(512), nullable=False)
    quality_score: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
        comment="InsightFace det_score at enrollment time",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.current_timestamp()
    )

    employee: Mapped[Employee] = relationship(back_populates="embeddings")

    __table_args__ = (Index("ix_face_embeddings_emp", "employee_id"),)


class AttendanceEvent(Base):
    __tablename__ = "attendance_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    employee_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("employees.id"), nullable=False
    )
    event_type: Mapped[str] = mapped_column(String(8), nullable=False)
    event_ts: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.current_timestamp(),
        comment="UTC; convert via RESTAURANT_TZ when computing day metrics",
    )
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    anti_spoof_score: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    frame_snapshot_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    kiosk_id: Mapped[str] = mapped_column(
        String(64), nullable=False, default="main", server_default="main"
    )
    source: Mapped[str] = mapped_column(
        String(16), nullable=False, default="kiosk", server_default="kiosk"
    )
    notes: Mapped[str | None] = mapped_column(
        Text, nullable=True, comment="Free text for manual admin overrides"
    )

    __table_args__ = (
        CheckConstraint(
            "event_type IN ('came','went')", name="ck_attendance_event_type"
        ),
        CheckConstraint(
            "source IN ('kiosk','manual')", name="ck_attendance_source"
        ),
        Index("ix_attendance_emp_ts", "employee_id", "event_ts"),
        Index("ix_attendance_ts", "event_ts"),
    )


class AdminUser(Base):
    __tablename__ = "admin_users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(
        String(64), nullable=False, unique=True
    )
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.current_timestamp()
    )
