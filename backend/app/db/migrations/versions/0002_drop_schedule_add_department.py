"""V1.1 — drop schedule columns, add department

Revision ID: 0002
Revises: 0001
Create Date: 2026-06-03

Context: real schedules at БЕК change too often for fixed-per-employee
`expected_arrival_time` / `min_work_hours_per_day` to be meaningful, so we
drop the columns AND the derived "опоздание" / "ранний уход" metrics
they fed. The dashboard now shows came_at / went_at / worked_hours /
"не отметился" only.

We add `department` ('hall' | 'kitchen' | 'other') as a structured axis
for filtering / grouping. The free-text `position` column stays untouched
and holds the specific role (Официант / Повар / Бармен / Управляющий / etc.).

SQLite path uses alembic's `batch_alter_table` so multiple column ops
become a copy-rebuild under the hood (SQLite < 3.35 has no ALTER DROP).
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("employees") as batch_op:
        batch_op.add_column(
            sa.Column(
                "department",
                sa.String(length=16),
                nullable=False,
                server_default="hall",
            )
        )
        batch_op.drop_column("expected_arrival_time")
        batch_op.drop_column("min_work_hours_per_day")


def downgrade() -> None:
    with op.batch_alter_table("employees") as batch_op:
        batch_op.add_column(
            sa.Column(
                "expected_arrival_time",
                sa.String(length=5),
                nullable=False,
                server_default="09:00",
            )
        )
        batch_op.add_column(
            sa.Column(
                "min_work_hours_per_day",
                sa.Float(),
                nullable=False,
                server_default="8.0",
            )
        )
        batch_op.drop_column("department")
