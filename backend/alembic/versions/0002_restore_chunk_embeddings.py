"""restore chunk embeddings

Revision ID: 0002_restore_chunk_embeddings
Revises: 0001_initial_local_postgres
Create Date: 2026-07-19 02:00:00
"""

from __future__ import annotations

from alembic import op

revision = "0002_restore_chunk_embeddings"
down_revision = "0001_initial_local_postgres"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public")
    op.execute("ALTER TABLE chunks DROP COLUMN IF EXISTS embedding")
    op.execute("ALTER TABLE chunks ADD COLUMN embedding vector(1536)")


def downgrade() -> None:
    op.execute("ALTER TABLE chunks DROP COLUMN IF EXISTS embedding")
