from __future__ import annotations

from typing import Any

import sqlalchemy as sa
from pgvector.sqlalchemy import Vector
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

EMBEDDING_DIMENSIONS = 384


class Base(DeclarativeBase):
    pass


class Workspace(Base):
    __tablename__ = "workspaces"

    id: Mapped[str] = mapped_column(sa.Text, primary_key=True)
    name: Mapped[str] = mapped_column(sa.Text, nullable=False)
    created_at: Mapped[str] = mapped_column(sa.Text, nullable=False)


class Document(Base):
    __tablename__ = "documents"
    __table_args__ = (
        sa.UniqueConstraint("workspace_id", "id", name="uq_documents_workspace_id_id"),
        sa.Index(
            "idx_documents_workspace_content_hash",
            "workspace_id",
            "content_hash",
            unique=True,
            postgresql_where=sa.text("content_hash <> ''"),
        ),
        sa.Index("idx_documents_workspace_id", "workspace_id"),
    )

    id: Mapped[int] = mapped_column(sa.Integer, primary_key=True, autoincrement=True)
    workspace_id: Mapped[str] = mapped_column(
        sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    filename: Mapped[str] = mapped_column(sa.Text, nullable=False)
    document_type: Mapped[str] = mapped_column(sa.Text, nullable=False)
    upload_time: Mapped[str] = mapped_column(sa.Text, nullable=False)
    parsed_text: Mapped[str] = mapped_column(sa.Text, nullable=False)
    page_count: Mapped[int] = mapped_column(
        sa.Integer, nullable=False, server_default=sa.text("1")
    )
    parser: Mapped[str] = mapped_column(
        sa.Text, nullable=False, server_default=sa.text("'legacy'")
    )
    ocr_used: Mapped[bool] = mapped_column(
        sa.Boolean, nullable=False, server_default=sa.text("false")
    )
    ocr_engine: Mapped[str] = mapped_column(
        sa.Text, nullable=False, server_default=sa.text("''")
    )
    ocr_confidence: Mapped[float | None] = mapped_column(sa.Float)
    extracted_tables_count: Mapped[int] = mapped_column(
        sa.Integer, nullable=False, server_default=sa.text("0")
    )
    extracted_images_count: Mapped[int] = mapped_column(
        sa.Integer, nullable=False, server_default=sa.text("0")
    )
    extraction_warnings: Mapped[list[str]] = mapped_column(
        JSONB, nullable=False, server_default=sa.text("'[]'::jsonb")
    )
    content_hash: Mapped[str] = mapped_column(
        sa.Text, nullable=False, server_default=sa.text("''")
    )
    size_bytes: Mapped[int] = mapped_column(
        sa.BigInteger, nullable=False, server_default=sa.text("0")
    )


class Chunk(Base):
    __tablename__ = "chunks"
    __table_args__ = (
        sa.ForeignKeyConstraint(
            ["workspace_id", "document_id"],
            ["documents.workspace_id", "documents.id"],
            ondelete="CASCADE",
        ),
        sa.Index("idx_chunks_workspace_id", "workspace_id"),
        sa.Index("idx_chunks_document_id", "document_id"),
        sa.Index("idx_chunks_document_chunk", "document_id", "chunk_index"),
    )

    id: Mapped[int] = mapped_column(sa.Integer, primary_key=True, autoincrement=True)
    workspace_id: Mapped[str] = mapped_column(sa.Text, nullable=False)
    document_id: Mapped[int] = mapped_column(sa.Integer, nullable=False)
    chunk_index: Mapped[int] = mapped_column(sa.Integer, nullable=False)
    page: Mapped[int] = mapped_column(sa.Integer, nullable=False)
    text: Mapped[str] = mapped_column(sa.Text, nullable=False)
    embedding: Mapped[list[float] | None] = mapped_column(Vector(EMBEDDING_DIMENSIONS))


class Entity(Base):
    __tablename__ = "entities"
    __table_args__ = (
        sa.ForeignKeyConstraint(
            ["workspace_id", "document_id"],
            ["documents.workspace_id", "documents.id"],
            ondelete="CASCADE",
        ),
        sa.Index("idx_entities_workspace_id", "workspace_id"),
        sa.Index("idx_entities_document_id", "document_id"),
    )

    id: Mapped[int] = mapped_column(sa.Integer, primary_key=True, autoincrement=True)
    workspace_id: Mapped[str] = mapped_column(sa.Text, nullable=False)
    document_id: Mapped[int] = mapped_column(sa.Integer, nullable=False)
    page: Mapped[int] = mapped_column(sa.Integer, nullable=False)
    entity_type: Mapped[str] = mapped_column(sa.Text, nullable=False)
    value: Mapped[str] = mapped_column(sa.Text, nullable=False)
    confidence: Mapped[float] = mapped_column(sa.Float, nullable=False)
    context: Mapped[str] = mapped_column(sa.Text, nullable=False)


class Asset(Base):
    __tablename__ = "assets"
    __table_args__ = (
        sa.PrimaryKeyConstraint("workspace_id", "id", name="assets_pkey"),
        sa.Index("idx_assets_workspace_id", "workspace_id"),
    )

    workspace_id: Mapped[str] = mapped_column(
        sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        primary_key=True,
    )
    id: Mapped[str] = mapped_column(sa.Text, nullable=False, primary_key=True)
    name: Mapped[str] = mapped_column(sa.Text, nullable=False)
    asset_type: Mapped[str] = mapped_column(sa.Text, nullable=False)
    location: Mapped[str] = mapped_column(sa.Text, nullable=False)
    risk_level: Mapped[str] = mapped_column(sa.Text, nullable=False)
    last_inspection: Mapped[str | None] = mapped_column(sa.Text)
    open_compliance_gaps: Mapped[int] = mapped_column(
        sa.Integer, nullable=False, server_default=sa.text("0")
    )
    suggested_actions: Mapped[list[str]] = mapped_column(
        JSONB, nullable=False, server_default=sa.text("'[]'::jsonb")
    )
    source_document: Mapped[str] = mapped_column(
        sa.Text, nullable=False, server_default=sa.text("''")
    )
    source_page: Mapped[int] = mapped_column(
        sa.Integer, nullable=False, server_default=sa.text("1")
    )
    evidence_text: Mapped[str] = mapped_column(
        sa.Text, nullable=False, server_default=sa.text("''")
    )


class AssetDocument(Base):
    __tablename__ = "asset_documents"
    __table_args__ = (
        sa.ForeignKeyConstraint(
            ["workspace_id", "asset_id"],
            ["assets.workspace_id", "assets.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "document_id"],
            ["documents.workspace_id", "documents.id"],
            ondelete="CASCADE",
        ),
        sa.Index("idx_asset_documents_workspace_id", "workspace_id"),
    )

    workspace_id: Mapped[str] = mapped_column(sa.Text, primary_key=True)
    asset_id: Mapped[str] = mapped_column(sa.Text, primary_key=True)
    document_id: Mapped[int] = mapped_column(sa.Integer, primary_key=True)


class TimelineEvent(Base):
    __tablename__ = "timeline_events"
    __table_args__ = (
        sa.ForeignKeyConstraint(
            ["workspace_id", "asset_id"],
            ["assets.workspace_id", "assets.id"],
            ondelete="CASCADE",
        ),
        sa.Index("idx_timeline_events_workspace_id", "workspace_id"),
        sa.Index("idx_timeline_events_asset_id", "asset_id"),
    )

    id: Mapped[int] = mapped_column(sa.Integer, primary_key=True, autoincrement=True)
    workspace_id: Mapped[str] = mapped_column(sa.Text, nullable=False)
    asset_id: Mapped[str] = mapped_column(sa.Text, nullable=False)
    event_date: Mapped[str] = mapped_column(sa.Text, nullable=False)
    event_type: Mapped[str] = mapped_column(sa.Text, nullable=False)
    title: Mapped[str] = mapped_column(sa.Text, nullable=False)
    description: Mapped[str] = mapped_column(sa.Text, nullable=False)
    source_document: Mapped[str] = mapped_column(sa.Text, nullable=False)
    source_page: Mapped[int] = mapped_column(
        sa.Integer, nullable=False, server_default=sa.text("1")
    )


class ComplianceGap(Base):
    __tablename__ = "compliance_gaps"
    __table_args__ = (
        sa.ForeignKeyConstraint(
            ["workspace_id", "asset_id"],
            ["assets.workspace_id", "assets.id"],
            ondelete="CASCADE",
        ),
        sa.Index("idx_compliance_gaps_workspace_id", "workspace_id"),
        sa.Index("idx_compliance_gaps_asset_id", "asset_id"),
    )

    id: Mapped[int] = mapped_column(sa.Integer, primary_key=True, autoincrement=True)
    workspace_id: Mapped[str] = mapped_column(sa.Text, nullable=False)
    asset_id: Mapped[str] = mapped_column(sa.Text, nullable=False)
    severity: Mapped[str] = mapped_column(sa.Text, nullable=False)
    gap_type: Mapped[str] = mapped_column(sa.Text, nullable=False)
    description: Mapped[str] = mapped_column(sa.Text, nullable=False)
    evidence: Mapped[str] = mapped_column(sa.Text, nullable=False)
    corrective_action: Mapped[str] = mapped_column(sa.Text, nullable=False)
    status: Mapped[str] = mapped_column(sa.Text, nullable=False)
    source_document: Mapped[str] = mapped_column(
        sa.Text, nullable=False, server_default=sa.text("''")
    )
    source_page: Mapped[int] = mapped_column(
        sa.Integer, nullable=False, server_default=sa.text("1")
    )


class Contradiction(Base):
    __tablename__ = "contradictions"
    __table_args__ = (
        sa.ForeignKeyConstraint(
            ["workspace_id", "asset_id"],
            ["assets.workspace_id", "assets.id"],
            ondelete="CASCADE",
        ),
        sa.Index("idx_contradictions_workspace_id", "workspace_id"),
        sa.Index("idx_contradictions_asset_id", "asset_id"),
        sa.Index("idx_contradictions_severity", "severity"),
    )

    id: Mapped[int] = mapped_column(sa.Integer, primary_key=True, autoincrement=True)
    workspace_id: Mapped[str] = mapped_column(sa.Text, nullable=False)
    asset_id: Mapped[str] = mapped_column(sa.Text, nullable=False)
    severity: Mapped[str] = mapped_column(sa.Text, nullable=False)
    contradiction_type: Mapped[str] = mapped_column(sa.Text, nullable=False)
    description: Mapped[str] = mapped_column(sa.Text, nullable=False)
    evidence_a: Mapped[str] = mapped_column(sa.Text, nullable=False)
    source_document_a: Mapped[str] = mapped_column(sa.Text, nullable=False)
    source_page_a: Mapped[int] = mapped_column(
        sa.Integer, nullable=False, server_default=sa.text("1")
    )
    evidence_b: Mapped[str] = mapped_column(sa.Text, nullable=False)
    source_document_b: Mapped[str] = mapped_column(sa.Text, nullable=False)
    source_page_b: Mapped[int] = mapped_column(
        sa.Integer, nullable=False, server_default=sa.text("1")
    )
    status: Mapped[str] = mapped_column(
        sa.Text, nullable=False, server_default=sa.text("'Open'")
    )


class GraphEdge(Base):
    __tablename__ = "graph_edges"
    __table_args__ = (
        sa.Index("idx_graph_edges_workspace_id", "workspace_id"),
        sa.Index("idx_graph_edges_source_id", "source_id"),
        sa.Index("idx_graph_edges_target_id", "target_id"),
        sa.Index("idx_graph_edges_validation_status", "validation_status"),
    )

    id: Mapped[int] = mapped_column(sa.Integer, primary_key=True, autoincrement=True)
    workspace_id: Mapped[str] = mapped_column(
        sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    source_id: Mapped[str] = mapped_column(sa.Text, nullable=False)
    target_id: Mapped[str] = mapped_column(sa.Text, nullable=False)
    label: Mapped[str] = mapped_column(sa.Text, nullable=False)
    relation_type: Mapped[str] = mapped_column(sa.Text, nullable=False)
    confidence: Mapped[float] = mapped_column(
        sa.Float, nullable=False, server_default=sa.text("0")
    )
    source_document: Mapped[str] = mapped_column(
        sa.Text, nullable=False, server_default=sa.text("''")
    )
    source_page: Mapped[int] = mapped_column(
        sa.Integer, nullable=False, server_default=sa.text("1")
    )
    evidence_text: Mapped[str] = mapped_column(
        sa.Text, nullable=False, server_default=sa.text("''")
    )
    validation_status: Mapped[str] = mapped_column(
        sa.Text, nullable=False, server_default=sa.text("'weak'")
    )
    validation_reason: Mapped[str] = mapped_column(
        sa.Text, nullable=False, server_default=sa.text("''")
    )


class AnalysisRun(Base):
    __tablename__ = "analysis_runs"
    __table_args__ = (sa.Index("idx_analysis_runs_workspace_id", "workspace_id"),)

    id: Mapped[int] = mapped_column(sa.Integer, primary_key=True, autoincrement=True)
    workspace_id: Mapped[str] = mapped_column(
        sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    source: Mapped[str] = mapped_column(sa.Text, nullable=False)
    status: Mapped[str] = mapped_column(sa.Text, nullable=False)
    message: Mapped[str] = mapped_column(
        sa.Text, nullable=False, server_default=sa.text("''")
    )
    started_at: Mapped[str] = mapped_column(sa.Text, nullable=False)
    completed_at: Mapped[str | None] = mapped_column(sa.Text)
    documents_ingested: Mapped[int] = mapped_column(
        sa.Integer, nullable=False, server_default=sa.text("0")
    )
    entities_extracted: Mapped[int] = mapped_column(
        sa.Integer, nullable=False, server_default=sa.text("0")
    )
    assets: Mapped[int] = mapped_column(
        sa.Integer, nullable=False, server_default=sa.text("0")
    )
    timeline_events: Mapped[int] = mapped_column(
        sa.Integer, nullable=False, server_default=sa.text("0")
    )
    compliance_gaps: Mapped[int] = mapped_column(
        sa.Integer, nullable=False, server_default=sa.text("0")
    )
    contradictions: Mapped[int] = mapped_column(
        sa.Integer, nullable=False, server_default=sa.text("0")
    )


JsonRecord = dict[str, Any]
