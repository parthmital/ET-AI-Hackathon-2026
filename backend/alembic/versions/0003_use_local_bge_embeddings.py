"""use local bge chunk embeddings

Revision ID: 0003_use_local_bge_embeddings
Revises: 0002_restore_chunk_embeddings
Create Date: 2026-07-19 03:00:00
"""

from __future__ import annotations

from alembic import op

revision = "0003_use_local_bge_embeddings"
down_revision = "0002_restore_chunk_embeddings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public")
    op.execute("ALTER TABLE chunks DROP COLUMN IF EXISTS embedding")
    op.execute("ALTER TABLE chunks ADD COLUMN embedding vector(384)")


def downgrade() -> None:
    op.execute("ALTER TABLE chunks DROP COLUMN IF EXISTS embedding")
    op.execute("ALTER TABLE chunks ADD COLUMN embedding vector(1536)")
