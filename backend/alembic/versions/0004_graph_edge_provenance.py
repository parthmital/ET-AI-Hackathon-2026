"""add graph edge provenance

Revision ID: 0004_graph_edge_provenance
Revises: 0003_use_local_bge_embeddings
Create Date: 2026-07-19 08:00:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0004_graph_edge_provenance"
down_revision = "0003_use_local_bge_embeddings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "assets",
        sa.Column(
            "source_document", sa.Text(), server_default=sa.text("''"), nullable=False
        ),
    )
    op.add_column(
        "assets",
        sa.Column(
            "source_page", sa.Integer(), server_default=sa.text("1"), nullable=False
        ),
    )
    op.add_column(
        "assets",
        sa.Column(
            "evidence_text", sa.Text(), server_default=sa.text("''"), nullable=False
        ),
    )
    op.add_column(
        "analysis_runs",
        sa.Column(
            "contradictions", sa.Integer(), server_default=sa.text("0"), nullable=False
        ),
    )

    op.create_table(
        "contradictions",
        sa.Column("id", sa.Integer(), sa.Identity(), nullable=False),
        sa.Column("asset_id", sa.Text(), nullable=False),
        sa.Column("severity", sa.Text(), nullable=False),
        sa.Column("contradiction_type", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("evidence_a", sa.Text(), nullable=False),
        sa.Column("source_document_a", sa.Text(), nullable=False),
        sa.Column(
            "source_page_a", sa.Integer(), server_default=sa.text("1"), nullable=False
        ),
        sa.Column("evidence_b", sa.Text(), nullable=False),
        sa.Column("source_document_b", sa.Text(), nullable=False),
        sa.Column(
            "source_page_b", sa.Integer(), server_default=sa.text("1"), nullable=False
        ),
        sa.Column(
            "status", sa.Text(), server_default=sa.text("'Open'"), nullable=False
        ),
        sa.ForeignKeyConstraint(["asset_id"], ["assets.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_contradictions_asset_id", "contradictions", ["asset_id"])
    op.create_index("idx_contradictions_severity", "contradictions", ["severity"])

    op.create_table(
        "graph_edges",
        sa.Column("id", sa.Integer(), sa.Identity(), nullable=False),
        sa.Column("source_id", sa.Text(), nullable=False),
        sa.Column("target_id", sa.Text(), nullable=False),
        sa.Column("label", sa.Text(), nullable=False),
        sa.Column("relation_type", sa.Text(), nullable=False),
        sa.Column(
            "confidence", sa.Float(), server_default=sa.text("0"), nullable=False
        ),
        sa.Column(
            "source_document", sa.Text(), server_default=sa.text("''"), nullable=False
        ),
        sa.Column(
            "source_page", sa.Integer(), server_default=sa.text("1"), nullable=False
        ),
        sa.Column(
            "evidence_text", sa.Text(), server_default=sa.text("''"), nullable=False
        ),
        sa.Column(
            "validation_status",
            sa.Text(),
            server_default=sa.text("'weak'"),
            nullable=False,
        ),
        sa.Column(
            "validation_reason", sa.Text(), server_default=sa.text("''"), nullable=False
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_graph_edges_source_id", "graph_edges", ["source_id"])
    op.create_index("idx_graph_edges_target_id", "graph_edges", ["target_id"])
    op.create_index(
        "idx_graph_edges_validation_status", "graph_edges", ["validation_status"]
    )


def downgrade() -> None:
    op.drop_index("idx_graph_edges_validation_status", table_name="graph_edges")
    op.drop_index("idx_graph_edges_target_id", table_name="graph_edges")
    op.drop_index("idx_graph_edges_source_id", table_name="graph_edges")
    op.drop_table("graph_edges")

    op.drop_index("idx_contradictions_severity", table_name="contradictions")
    op.drop_index("idx_contradictions_asset_id", table_name="contradictions")
    op.drop_table("contradictions")

    op.drop_column("analysis_runs", "contradictions")
    op.drop_column("assets", "evidence_text")
    op.drop_column("assets", "source_page")
    op.drop_column("assets", "source_document")
