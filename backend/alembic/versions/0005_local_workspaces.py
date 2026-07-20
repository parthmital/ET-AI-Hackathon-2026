"""add local workspace scope

Revision ID: 0005_local_workspaces
Revises: 0004_graph_edge_provenance
Create Date: 2026-07-20 00:00:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0005_local_workspaces"
down_revision = "0004_graph_edge_provenance"
branch_labels = None
depends_on = None

LOCAL_WORKSPACE_ID = "local-workspace"


def upgrade() -> None:
    op.create_table(
        "workspaces",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("created_at", sa.Text(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.execute(f"""
        INSERT INTO workspaces (id, name, created_at)
        VALUES ('{LOCAL_WORKSPACE_ID}', 'Local Workspace', now()::text)
        ON CONFLICT (id) DO NOTHING
        """)

    for table in (
        "documents",
        "chunks",
        "entities",
        "assets",
        "asset_documents",
        "timeline_events",
        "compliance_gaps",
        "contradictions",
        "graph_edges",
        "analysis_runs",
    ):
        op.add_column(table, sa.Column("workspace_id", sa.Text(), nullable=True))
        op.execute(f"UPDATE {table} SET workspace_id = '{LOCAL_WORKSPACE_ID}'")
        op.alter_column(table, "workspace_id", nullable=False)

    op.add_column(
        "documents",
        sa.Column(
            "size_bytes", sa.BigInteger(), server_default=sa.text("0"), nullable=False
        ),
    )

    op.drop_index("idx_documents_content_hash", table_name="documents")
    op.create_unique_constraint(
        "uq_documents_workspace_id_id", "documents", ["workspace_id", "id"]
    )
    op.create_index("idx_documents_workspace_id", "documents", ["workspace_id"])
    op.create_index(
        "idx_documents_workspace_content_hash",
        "documents",
        ["workspace_id", "content_hash"],
        unique=True,
        postgresql_where=sa.text("content_hash <> ''"),
    )

    op.drop_constraint(
        "asset_documents_asset_id_fkey", "asset_documents", type_="foreignkey"
    )
    op.drop_constraint("asset_documents_pkey", "asset_documents", type_="primary")
    op.drop_constraint(
        "timeline_events_asset_id_fkey", "timeline_events", type_="foreignkey"
    )
    op.drop_constraint(
        "compliance_gaps_asset_id_fkey", "compliance_gaps", type_="foreignkey"
    )
    op.drop_constraint(
        "contradictions_asset_id_fkey", "contradictions", type_="foreignkey"
    )
    op.drop_constraint("assets_pkey", "assets", type_="primary")
    op.create_primary_key("assets_pkey", "assets", ["workspace_id", "id"])
    op.create_primary_key(
        "asset_documents_pkey",
        "asset_documents",
        ["workspace_id", "asset_id", "document_id"],
    )

    op.create_foreign_key(
        "fk_assets_workspace",
        "assets",
        "workspaces",
        ["workspace_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_documents_workspace",
        "documents",
        "workspaces",
        ["workspace_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_graph_edges_workspace",
        "graph_edges",
        "workspaces",
        ["workspace_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_analysis_runs_workspace",
        "analysis_runs",
        "workspaces",
        ["workspace_id"],
        ["id"],
        ondelete="CASCADE",
    )

    op.create_foreign_key(
        "fk_chunks_workspace_document",
        "chunks",
        "documents",
        ["workspace_id", "document_id"],
        ["workspace_id", "id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_entities_workspace_document",
        "entities",
        "documents",
        ["workspace_id", "document_id"],
        ["workspace_id", "id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_asset_documents_workspace_asset",
        "asset_documents",
        "assets",
        ["workspace_id", "asset_id"],
        ["workspace_id", "id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_asset_documents_workspace_document",
        "asset_documents",
        "documents",
        ["workspace_id", "document_id"],
        ["workspace_id", "id"],
        ondelete="CASCADE",
    )
    for table in ("timeline_events", "compliance_gaps", "contradictions"):
        op.create_foreign_key(
            f"fk_{table}_workspace_asset",
            table,
            "assets",
            ["workspace_id", "asset_id"],
            ["workspace_id", "id"],
            ondelete="CASCADE",
        )

    for table in (
        "chunks",
        "entities",
        "assets",
        "asset_documents",
        "timeline_events",
        "compliance_gaps",
        "contradictions",
        "graph_edges",
        "analysis_runs",
    ):
        op.create_index(f"idx_{table}_workspace_id", table, ["workspace_id"])


def downgrade() -> None:
    for table in (
        "analysis_runs",
        "graph_edges",
        "contradictions",
        "compliance_gaps",
        "timeline_events",
        "asset_documents",
        "assets",
        "entities",
        "chunks",
    ):
        op.drop_index(f"idx_{table}_workspace_id", table_name=table)

    for table in ("timeline_events", "compliance_gaps", "contradictions"):
        op.drop_constraint(f"fk_{table}_workspace_asset", table, type_="foreignkey")
    op.drop_constraint(
        "fk_asset_documents_workspace_document", "asset_documents", type_="foreignkey"
    )
    op.drop_constraint(
        "fk_asset_documents_workspace_asset", "asset_documents", type_="foreignkey"
    )
    op.drop_constraint("fk_entities_workspace_document", "entities", type_="foreignkey")
    op.drop_constraint("fk_chunks_workspace_document", "chunks", type_="foreignkey")
    op.drop_constraint(
        "fk_analysis_runs_workspace", "analysis_runs", type_="foreignkey"
    )
    op.drop_constraint("fk_graph_edges_workspace", "graph_edges", type_="foreignkey")
    op.drop_constraint("fk_documents_workspace", "documents", type_="foreignkey")
    op.drop_constraint("fk_assets_workspace", "assets", type_="foreignkey")

    op.drop_constraint("assets_pkey", "assets", type_="primary")
    op.create_primary_key("assets_pkey", "assets", ["id"])
    op.drop_constraint("asset_documents_pkey", "asset_documents", type_="primary")
    op.create_primary_key(
        "asset_documents_pkey", "asset_documents", ["asset_id", "document_id"]
    )
    op.create_foreign_key(
        "asset_documents_asset_id_fkey",
        "asset_documents",
        "assets",
        ["asset_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "timeline_events_asset_id_fkey",
        "timeline_events",
        "assets",
        ["asset_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "compliance_gaps_asset_id_fkey",
        "compliance_gaps",
        "assets",
        ["asset_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "contradictions_asset_id_fkey",
        "contradictions",
        "assets",
        ["asset_id"],
        ["id"],
        ondelete="CASCADE",
    )

    op.drop_index("idx_documents_workspace_content_hash", table_name="documents")
    op.drop_index("idx_documents_workspace_id", table_name="documents")
    op.drop_constraint("uq_documents_workspace_id_id", "documents", type_="unique")
    op.create_index(
        "idx_documents_content_hash",
        "documents",
        ["content_hash"],
        unique=True,
        postgresql_where=sa.text("content_hash <> ''"),
    )
    op.drop_column("documents", "size_bytes")

    for table in (
        "analysis_runs",
        "graph_edges",
        "contradictions",
        "compliance_gaps",
        "timeline_events",
        "asset_documents",
        "assets",
        "entities",
        "chunks",
        "documents",
    ):
        op.drop_column(table, "workspace_id")

    op.drop_table("workspaces")
