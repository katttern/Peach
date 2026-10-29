"""create agendas table

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-28
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "agendas",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("meeting_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("title", sa.String(), nullable=True),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("duration_minutes", sa.Integer(), nullable=True),
        sa.Column(
            "items",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "action_items",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column("ai_suggestion", postgresql.JSONB(), nullable=True),
        sa.Column("ai_model", sa.String(), nullable=True),
        sa.Column("ai_prompt_version", sa.String(), nullable=True),
        sa.Column("created_by", sa.String(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["meeting_id"], ["meetings.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("meeting_id"),
    )


def downgrade() -> None:
    op.drop_table("agendas")
