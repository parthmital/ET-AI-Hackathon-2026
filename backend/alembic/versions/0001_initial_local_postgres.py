"""initial local postgres schema

Revision ID: 0001_initial_local_postgres
Revises:
Create Date: 2026-07-18 00:00:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0001_initial_local_postgres"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "documents",
        sa.Column("id", sa.Integer(), sa.Identity(), nullable=False),
        sa.Column("filename", sa.Text(), nullable=False),
        sa.Column("document_type", sa.Text(), nullable=False),
        sa.Column("upload_time", sa.Text(), nullable=False),
        sa.Column("parsed_text", sa.Text(), nullable=False),
        sa.Column(
            "page_count", sa.Integer(), server_default=sa.text("1"), nullable=False
        ),
        sa.Column(
            "parser", sa.Text(), server_default=sa.text("'legacy'"), nullable=False
        ),
        sa.Column(
            "ocr_used", sa.Boolean(), server_default=sa.text("false"), nullable=False
        ),
        sa.Column(
            "ocr_engine", sa.Text(), server_default=sa.text("''"), nullable=False
        ),
        sa.Column("ocr_confidence", sa.Float(), nullable=True),
        sa.Column(
            "extracted_tables_count",
            sa.Integer(),
            server_default=sa.text("0"),
            nullable=False,
        ),
        sa.Column(
            "extracted_images_count",
            sa.Integer(),
            server_default=sa.text("0"),
            nullable=False,
        ),
        sa.Column(
            "extraction_warnings",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
        sa.Column(
            "content_hash", sa.Text(), server_default=sa.text("''"), nullable=False
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "idx_documents_content_hash",
        "documents",
        ["content_hash"],
        unique=True,
        postgresql_where=sa.text("content_hash <> ''"),
    )

    op.create_table(
        "chunks",
        sa.Column("id", sa.Integer(), sa.Identity(), nullable=False),
        sa.Column("document_id", sa.Integer(), nullable=False),
        sa.Column("chunk_index", sa.Integer(), nullable=False),
        sa.Column("page", sa.Integer(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.ForeignKeyConstraint(["document_id"], ["documents.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_chunks_document_id", "chunks", ["document_id"])
    op.create_index(
        "idx_chunks_document_chunk", "chunks", ["document_id", "chunk_index"]
    )

    op.create_table(
        "entities",
        sa.Column("id", sa.Integer(), sa.Identity(), nullable=False),
        sa.Column("document_id", sa.Integer(), nullable=False),
        sa.Column("page", sa.Integer(), nullable=False),
        sa.Column("entity_type", sa.Text(), nullable=False),
        sa.Column("value", sa.Text(), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=False),
        sa.Column("context", sa.Text(), nullable=False),
        sa.ForeignKeyConstraint(["document_id"], ["documents.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_entities_document_id", "entities", ["document_id"])

    op.create_table(
        "assets",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("asset_type", sa.Text(), nullable=False),
        sa.Column("location", sa.Text(), nullable=False),
        sa.Column("risk_level", sa.Text(), nullable=False),
        sa.Column("last_inspection", sa.Text(), nullable=True),
        sa.Column(
            "open_compliance_gaps",
            sa.Integer(),
            server_default=sa.text("0"),
            nullable=False,
        ),
        sa.Column(
            "suggested_actions",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "asset_documents",
        sa.Column("asset_id", sa.Text(), nullable=False),
        sa.Column("document_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["asset_id"], ["assets.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["document_id"], ["documents.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("asset_id", "document_id"),
    )

    op.create_table(
        "timeline_events",
        sa.Column("id", sa.Integer(), sa.Identity(), nullable=False),
        sa.Column("asset_id", sa.Text(), nullable=False),
        sa.Column("event_date", sa.Text(), nullable=False),
        sa.Column("event_type", sa.Text(), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("source_document", sa.Text(), nullable=False),
        sa.Column(
            "source_page", sa.Integer(), server_default=sa.text("1"), nullable=False
        ),
        sa.ForeignKeyConstraint(["asset_id"], ["assets.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_timeline_events_asset_id", "timeline_events", ["asset_id"])

    op.create_table(
        "compliance_gaps",
        sa.Column("id", sa.Integer(), sa.Identity(), nullable=False),
        sa.Column("asset_id", sa.Text(), nullable=False),
        sa.Column("severity", sa.Text(), nullable=False),
        sa.Column("gap_type", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("evidence", sa.Text(), nullable=False),
        sa.Column("corrective_action", sa.Text(), nullable=False),
        sa.Column("status", sa.Text(), nullable=False),
        sa.Column(
            "source_document", sa.Text(), server_default=sa.text("''"), nullable=False
        ),
        sa.Column(
            "source_page", sa.Integer(), server_default=sa.text("1"), nullable=False
        ),
        sa.ForeignKeyConstraint(["asset_id"], ["assets.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_compliance_gaps_asset_id", "compliance_gaps", ["asset_id"])

    op.create_table(
        "analysis_runs",
        sa.Column("id", sa.Integer(), sa.Identity(), nullable=False),
        sa.Column("source", sa.Text(), nullable=False),
        sa.Column("status", sa.Text(), nullable=False),
        sa.Column("message", sa.Text(), server_default=sa.text("''"), nullable=False),
        sa.Column("started_at", sa.Text(), nullable=False),
        sa.Column("completed_at", sa.Text(), nullable=True),
        sa.Column(
            "documents_ingested",
            sa.Integer(),
            server_default=sa.text("0"),
            nullable=False,
        ),
        sa.Column(
            "entities_extracted",
            sa.Integer(),
            server_default=sa.text("0"),
            nullable=False,
        ),
        sa.Column("assets", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column(
            "timeline_events",
            sa.Integer(),
            server_default=sa.text("0"),
            nullable=False,
        ),
        sa.Column(
            "compliance_gaps",
            sa.Integer(),
            server_default=sa.text("0"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("analysis_runs")
    op.drop_index("idx_compliance_gaps_asset_id", table_name="compliance_gaps")
    op.drop_table("compliance_gaps")
    op.drop_index("idx_timeline_events_asset_id", table_name="timeline_events")
    op.drop_table("timeline_events")
    op.drop_table("asset_documents")
    op.drop_table("assets")
    op.drop_index("idx_entities_document_id", table_name="entities")
    op.drop_table("entities")
    op.drop_index("idx_chunks_document_chunk", table_name="chunks")
    op.drop_index("idx_chunks_document_id", table_name="chunks")
    op.drop_table("chunks")
    op.drop_index("idx_documents_content_hash", table_name="documents")
    op.drop_table("documents")
