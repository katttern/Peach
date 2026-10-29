"""meetings belong to a Cognito user (owner_sub)

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-28
"""

import sqlalchemy as sa
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Rows that predate ownership (e.g. Lab 5 demo data in the reports RDS) are
    # kept but owned by nobody real, so no signed-in user can see them.
    op.add_column(
        "meetings",
        sa.Column("owner_sub", sa.String(), nullable=False, server_default="legacy"),
    )
    op.alter_column("meetings", "owner_sub", server_default=None)
    op.create_index("ix_meetings_owner_sub", "meetings", ["owner_sub"])


def downgrade() -> None:
    op.drop_index("ix_meetings_owner_sub", table_name="meetings")
    op.drop_column("meetings", "owner_sub")
