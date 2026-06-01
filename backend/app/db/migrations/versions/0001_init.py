"""init

Revision ID: 0001
Revises:
Create Date: 2026-06-01

Hand-written initial migration. Future revisions can use autogen.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "0001"
down_revision: str | None = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "employees",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("full_name", sa.String(length=255), nullable=False),
        sa.Column("position", sa.String(length=255), nullable=False),
        sa.Column("phone", sa.String(length=64), nullable=True),
        sa.Column("photo_path", sa.String(length=512), nullable=True),
        sa.Column(
            "expected_arrival_time",
            sa.String(length=5),
            nullable=False,
            server_default="09:00",
        ),
        sa.Column(
            "min_work_hours_per_day",
            sa.Float(),
            nullable=False,
            server_default="8.0",
        ),
        sa.Column("is_active", sa.Integer(), nullable=False, server_default="1"),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.current_timestamp(),
        ),
        sa.Column("deactivated_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_employees_active", "employees", ["is_active"])

    op.create_table(
        "face_embeddings",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("employee_id", sa.Integer(), nullable=False),
        sa.Column("embedding", sa.LargeBinary(), nullable=False),
        sa.Column("source_photo_path", sa.String(length=512), nullable=False),
        sa.Column("quality_score", sa.Float(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.current_timestamp(),
        ),
        sa.ForeignKeyConstraint(
            ["employee_id"], ["employees.id"], ondelete="CASCADE"
        ),
    )
    op.create_index("ix_face_embeddings_emp", "face_embeddings", ["employee_id"])

    op.create_table(
        "attendance_events",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("employee_id", sa.Integer(), nullable=False),
        sa.Column("event_type", sa.String(length=8), nullable=False),
        sa.Column(
            "event_ts",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.current_timestamp(),
        ),
        sa.Column("confidence", sa.Float(), nullable=False),
        sa.Column(
            "anti_spoof_score", sa.Float(), nullable=False, server_default="1.0"
        ),
        sa.Column("frame_snapshot_path", sa.String(length=512), nullable=True),
        sa.Column("kiosk_id", sa.String(length=64), nullable=False, server_default="main"),
        sa.Column("source", sa.String(length=16), nullable=False, server_default="kiosk"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["employee_id"], ["employees.id"]),
        sa.CheckConstraint(
            "event_type IN ('came','went')", name="ck_attendance_event_type"
        ),
        sa.CheckConstraint(
            "source IN ('kiosk','manual')", name="ck_attendance_source"
        ),
    )
    op.create_index(
        "ix_attendance_emp_ts",
        "attendance_events",
        ["employee_id", "event_ts"],
    )
    op.create_index("ix_attendance_ts", "attendance_events", ["event_ts"])

    op.create_table(
        "admin_users",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("username", sa.String(length=64), nullable=False, unique=True),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.current_timestamp(),
        ),
    )


def downgrade() -> None:
    op.drop_table("admin_users")
    op.drop_index("ix_attendance_ts", table_name="attendance_events")
    op.drop_index("ix_attendance_emp_ts", table_name="attendance_events")
    op.drop_table("attendance_events")
    op.drop_index("ix_face_embeddings_emp", table_name="face_embeddings")
    op.drop_table("face_embeddings")
    op.drop_index("ix_employees_active", table_name="employees")
    op.drop_table("employees")
