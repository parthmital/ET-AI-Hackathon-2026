from __future__ import annotations

import json
import logging
import time
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Iterator

import sqlalchemy as sa
from alembic import command
from alembic.config import Config
from sqlalchemy import delete, func, select, text, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.engine import Connection, Engine
from sqlalchemy.orm import Session, sessionmaker

from app.db.models import (
    AnalysisRun,
    Asset,
    AssetDocument,
    Chunk,
    ComplianceGap,
    Contradiction,
    Document,
    Entity,
    GraphEdge,
    TimelineEvent,
    Workspace,
)
from app.core.workspace import WorkspaceContext, get_workspace_context
from app.core.terminal_logging import (
    configure_terminal_logging,
    log_blob,
    log_event,
)
from app.settings import Settings

LOGGER = logging.getLogger(__name__)


class Database:
    _engine: Engine | None = None
    _session_factory: sessionmaker[Session] | None = None

    @staticmethod
    def engine() -> Engine:
        if Database._engine is None:
            log_event(
                LOGGER,
                "database.engine.create",
                database_schema=Settings.database_schema(),
            )
            connect_args: dict[str, object] = {"prepare_threshold": None}
            Database._engine = sa.create_engine(
                Settings.database_url(),
                echo=Settings.sqlalchemy_echo(),
                echo_pool=Settings.sqlalchemy_echo_pool(),
                pool_pre_ping=True,
                future=True,
                connect_args=connect_args,
                hide_parameters=True,
                logging_name="industrial_ops_brain",
                pool_logging_name="industrial_ops_brain_pool",
            )
        return Database._engine

    @staticmethod
    def session_factory() -> sessionmaker[Session]:
        if Database._session_factory is None:
            log_event(LOGGER, "database.session_factory.create")
            Database._session_factory = sessionmaker(
                bind=Database.engine(),
                expire_on_commit=False,
                future=True,
            )
        return Database._session_factory

    @staticmethod
    @contextmanager
    def session() -> Iterator[Session]:
        session = Database.session_factory()()
        session_id = id(session)
        started_at = time.perf_counter()
        log_event(
            LOGGER,
            "database.session.start",
            session_id=session_id,
            schema=Settings.database_schema(),
        )
        try:
            Database._set_session_schema(session)
            yield session
            session.commit()
            log_event(
                LOGGER,
                "database.session.commit",
                session_id=session_id,
                elapsed_seconds=round(time.perf_counter() - started_at, 3),
            )
        except Exception:
            session.rollback()
            log_event(
                LOGGER,
                "database.session.rollback",
                level=logging.ERROR,
                session_id=session_id,
                elapsed_seconds=round(time.perf_counter() - started_at, 3),
            )
            raise
        finally:
            session.close()
            log_event(
                LOGGER,
                "database.session.close",
                session_id=session_id,
                elapsed_seconds=round(time.perf_counter() - started_at, 3),
            )

    @staticmethod
    def dispose() -> None:
        if Database._engine is not None:
            log_event(LOGGER, "database.engine.dispose")
            Database._engine.dispose()
        Database._engine = None
        Database._session_factory = None

    @staticmethod
    def initialise() -> None:
        started_at = time.perf_counter()
        log_event(
            LOGGER,
            "database.initialise.start",
            backend_dir=str(Settings.backend_dir),
            schema=Settings.database_schema(),
        )
        Settings.ensure_directories()
        config = Config(str(Settings.backend_dir / "alembic.ini"))
        config.set_main_option("script_location", str(Settings.backend_dir / "alembic"))
        command.upgrade(config, "head")
        configure_terminal_logging()
        Database.dispose()
        log_event(
            LOGGER,
            "database.initialise.finish",
            elapsed_seconds=round(time.perf_counter() - started_at, 3),
        )

    @staticmethod
    def workspace_id() -> str:
        context = get_workspace_context()
        return context.workspace_id if context else Settings.default_workspace_id()

    @staticmethod
    def ensure_local_workspace() -> WorkspaceContext:
        workspace_id = Settings.default_workspace_id()
        workspace_name = Settings.default_workspace_name()
        now = datetime.now(timezone.utc).isoformat()
        log_event(
            LOGGER,
            "database.ensure_local_workspace.start",
            workspace_id=workspace_id,
        )
        with Database.session() as session:
            workspace = session.get(Workspace, workspace_id)
            if not workspace:
                session.add(
                    Workspace(
                        id=workspace_id,
                        name=workspace_name,
                        created_at=now,
                    )
                )
        context = WorkspaceContext(
            workspace_id=workspace_id,
            workspace_name=workspace_name,
        )
        log_event(
            LOGGER,
            "database.ensure_local_workspace.finish",
            workspace_id=workspace_id,
        )
        return context

    @staticmethod
    def clear_workspace() -> None:
        workspace_id = Database.workspace_id()
        log_event(LOGGER, "database.clear_workspace.start", workspace_id=workspace_id)
        with Database.session() as session:
            for model in (
                GraphEdge,
                Contradiction,
                ComplianceGap,
                TimelineEvent,
                AssetDocument,
                Asset,
                Entity,
                Chunk,
                Document,
                AnalysisRun,
            ):
                session.execute(delete(model).where(model.workspace_id == workspace_id))
        log_event(LOGGER, "database.clear_workspace.finish", workspace_id=workspace_id)

    @staticmethod
    def clear_generated_analysis() -> None:
        workspace_id = Database.workspace_id()
        log_event(
            LOGGER, "database.clear_generated_analysis.start", workspace_id=workspace_id
        )
        with Database.session() as session:
            for model in (
                GraphEdge,
                Contradiction,
                ComplianceGap,
                TimelineEvent,
                AssetDocument,
                Asset,
                Entity,
            ):
                session.execute(delete(model).where(model.workspace_id == workspace_id))
        log_event(
            LOGGER,
            "database.clear_generated_analysis.finish",
            workspace_id=workspace_id,
        )

    @staticmethod
    def find_document_by_hash(content_hash: str) -> dict[str, Any] | None:
        workspace_id = Database.workspace_id()
        log_event(
            LOGGER,
            "database.find_document_by_hash.start",
            sha256=content_hash,
            workspace_id=workspace_id,
        )
        result = Database.row(
            """
            SELECT id, filename
            FROM documents
            WHERE workspace_id = ? AND content_hash = ?
            """,
            (workspace_id, content_hash),
        )
        log_blob(LOGGER, "database.find_document_by_hash.result", result)
        return result

    @staticmethod
    def start_analysis_run(source: str) -> int:
        workspace_id = Database.workspace_id()
        log_event(
            LOGGER,
            "database.analysis_run.start.begin",
            source=source,
            workspace_id=workspace_id,
        )
        document_count = len(Database.list_documents())
        entity_count = len(Database.list_entities())
        with Database.session() as session:
            run = AnalysisRun(
                workspace_id=workspace_id,
                source=source,
                status="running",
                started_at=datetime.now(timezone.utc).isoformat(),
                documents_ingested=document_count,
                entities_extracted=entity_count,
            )
            session.add(run)
            session.flush()
            run_id = int(run.id)
            log_event(
                LOGGER,
                "database.analysis_run.start.created",
                run_id=run_id,
                source=source,
                documents_ingested=document_count,
                entities_extracted=entity_count,
            )
            return run_id

    @staticmethod
    def finish_analysis_run(
        run_id: int,
        status: str,
        message: str = "",
        assets: int = 0,
        timeline_events: int = 0,
        compliance_gaps: int = 0,
        contradictions: int = 0,
    ) -> dict[str, Any]:
        completed_at = datetime.now(timezone.utc).isoformat()
        document_count = len(Database.list_documents())
        entity_count = len(Database.list_entities())
        log_event(
            LOGGER,
            "database.analysis_run.finish.begin",
            run_id=run_id,
            status=status,
            message=message,
            documents_ingested=document_count,
            entities_extracted=entity_count,
            assets=assets,
            timeline_events=timeline_events,
            compliance_gaps=compliance_gaps,
            contradictions=contradictions,
        )
        with Database.session() as session:
            session.execute(
                update(AnalysisRun)
                .where(
                    AnalysisRun.id == run_id,
                    AnalysisRun.workspace_id == Database.workspace_id(),
                )
                .values(
                    status=status,
                    message=message,
                    completed_at=completed_at,
                    documents_ingested=document_count,
                    entities_extracted=entity_count,
                    assets=assets,
                    timeline_events=timeline_events,
                    compliance_gaps=compliance_gaps,
                    contradictions=contradictions,
                )
            )
        result = Database.latest_analysis_status()
        log_blob(LOGGER, "database.analysis_run.finish.result", result)
        return result

    @staticmethod
    def latest_analysis_status() -> dict[str, Any]:
        workspace_id = Database.workspace_id()
        log_event(
            LOGGER, "database.latest_analysis_status.start", workspace_id=workspace_id
        )
        row = Database.row(
            """
            SELECT *
            FROM analysis_runs
            WHERE workspace_id = ?
            ORDER BY id DESC
            LIMIT 1
            """,
            (workspace_id,),
        )
        if row:
            result = {
                "analysis_status": row["status"],
                "analysis_message": row["message"],
                "analysis_source": row["source"],
                "analysis_started_at": row["started_at"],
                "analysis_completed_at": row["completed_at"],
                "documents_ingested": row["documents_ingested"],
                "entities_extracted": row["entities_extracted"],
                "assets": row["assets"],
                "timeline_events": row["timeline_events"],
                "compliance_gaps": row["compliance_gaps"],
                "contradictions": row.get("contradictions", 0),
            }
            current_document_count = len(Database.list_documents())
            if (
                row["status"] == "complete"
                and current_document_count != row["documents_ingested"]
            ):
                result["analysis_status"] = "stale"
                result["analysis_message"] = (
                    "Uploaded documents changed after the last completed analysis."
                )
                result["documents_ingested"] = current_document_count
            log_blob(LOGGER, "database.latest_analysis_status.result", result)
            result["agent_stages"] = Database.analysis_agent_stages(result)
            return result
        result = {
            "analysis_status": "not_run",
            "analysis_message": "",
            "analysis_source": "",
            "analysis_started_at": None,
            "analysis_completed_at": None,
            "documents_ingested": len(Database.list_documents()),
            "entities_extracted": len(Database.list_entities()),
            "assets": len(Database.list_assets()),
            "timeline_events": len(
                Database.rows(
                    "SELECT id FROM timeline_events WHERE workspace_id = ?",
                    (workspace_id,),
                )
            ),
            "compliance_gaps": len(
                Database.rows(
                    "SELECT id FROM compliance_gaps WHERE workspace_id = ?",
                    (workspace_id,),
                )
            ),
            "contradictions": len(
                Database.rows(
                    "SELECT id FROM contradictions WHERE workspace_id = ?",
                    (workspace_id,),
                )
            ),
        }
        result["agent_stages"] = Database.analysis_agent_stages(result)
        log_blob(LOGGER, "database.latest_analysis_status.result", result)
        return result

    @staticmethod
    def analysis_agent_stages(status: dict[str, Any]) -> list[dict[str, Any]]:
        documents = int(status.get("documents_ingested") or 0)
        entities = int(status.get("entities_extracted") or 0)
        assets = int(status.get("assets") or 0)
        gaps = int(status.get("compliance_gaps") or 0)
        contradictions = int(status.get("contradictions") or 0)
        graph_edges = len(
            Database.rows(
                "SELECT id FROM graph_edges WHERE workspace_id = ?",
                (Database.workspace_id(),),
            )
        )
        analysis_status = str(status.get("analysis_status") or "not_run")

        def stage_status(record_count: int) -> str:
            if analysis_status == "running":
                return "running"
            if analysis_status == "failed":
                return "blocked"
            if analysis_status == "stale":
                return "stale"
            if record_count:
                return "complete"
            return "not_run"

        document_status = "complete" if documents else "not_run"
        compliance_status = stage_status(gaps)
        if analysis_status == "complete" and assets and not gaps:
            compliance_status = "complete"
        rca_status = (
            "ready"
            if assets and graph_edges and analysis_status != "running"
            else "not_run"
        )
        result = [
            {
                "stage": "Document",
                "status": document_status,
                "records": documents,
                "message": f"{documents} documents ingested; {entities} entities extracted.",
            },
            {
                "stage": "Graph",
                "status": stage_status(graph_edges),
                "records": graph_edges,
                "message": f"{graph_edges} persisted evidence edges.",
            },
            {
                "stage": "Compliance",
                "status": compliance_status,
                "records": gaps,
                "message": f"{gaps} generated gaps tied to source evidence.",
            },
            {
                "stage": "RCA",
                "status": rca_status,
                "records": contradictions,
                "message": (
                    f"{contradictions} contradictions available for RCA context."
                    if rca_status == "ready"
                    else "RCA becomes ready after assets and graph evidence exist."
                ),
            },
        ]
        log_blob(LOGGER, "database.analysis_agent_stages", result)
        return result

    @staticmethod
    def insert_document(
        filename: str,
        document_type: str,
        parsed_text: str,
        page_count: int,
        content_hash: str = "",
        parser_metadata: dict[str, Any] | None = None,
        size_bytes: int = 0,
    ) -> int:
        log_blob(
            LOGGER,
            "database.insert_document.start",
            parsed_text,
            filename=filename,
            document_type=document_type,
            page_count=page_count,
            content_hash=content_hash,
            parser_metadata=parser_metadata,
        )
        with Database.session() as session:
            document = Database._document(
                filename,
                document_type,
                parsed_text,
                page_count,
                content_hash,
                parser_metadata,
                size_bytes,
            )
            session.add(document)
            session.flush()
            document_id = int(document.id)
            log_event(
                LOGGER,
                "database.insert_document.finish",
                document_id=document_id,
                filename=filename,
            )
            return document_id

    @staticmethod
    def insert_ingested_document(
        filename: str,
        document_type: str,
        parsed_text: str,
        page_count: int,
        content_hash: str,
        chunks: list[dict[str, Any]],
        parser_metadata: dict[str, Any] | None = None,
        size_bytes: int = 0,
    ) -> int:
        log_blob(
            LOGGER,
            "database.insert_ingested_document.start",
            {
                "parsed_text": parsed_text,
                "chunks": chunks,
            },
            filename=filename,
            document_type=document_type,
            page_count=page_count,
            content_hash=content_hash,
            parser_metadata=parser_metadata,
            chunk_count=len(chunks),
        )
        with Database.session() as session:
            document = Database._document(
                filename,
                document_type,
                parsed_text,
                page_count,
                content_hash,
                parser_metadata,
                size_bytes,
            )
            session.add(document)
            session.flush()
            session.add_all(
                [
                    Chunk(
                        workspace_id=Database.workspace_id(),
                        document_id=int(document.id),
                        chunk_index=int(chunk["chunk_index"]),
                        page=int(chunk["page"]),
                        text=str(chunk["text"]),
                    )
                    for chunk in chunks
                ]
            )
            document_id = int(document.id)
            log_event(
                LOGGER,
                "database.insert_ingested_document.finish",
                document_id=document_id,
                filename=filename,
                chunk_count=len(chunks),
            )
            return document_id

    @staticmethod
    def _document(
        filename: str,
        document_type: str,
        parsed_text: str,
        page_count: int,
        content_hash: str,
        parser_metadata: dict[str, Any] | None,
        size_bytes: int = 0,
    ) -> Document:
        metadata = parser_metadata or {}
        return Document(
            workspace_id=Database.workspace_id(),
            filename=filename,
            document_type=document_type,
            upload_time=datetime.now(timezone.utc).isoformat(),
            parsed_text=parsed_text,
            page_count=page_count,
            parser=str(metadata.get("parser", "unknown")),
            ocr_used=bool(metadata.get("ocr_used")),
            ocr_engine=str(metadata.get("ocr_engine", "")),
            ocr_confidence=metadata.get("ocr_confidence"),
            extracted_tables_count=int(metadata.get("extracted_tables_count", 0)),
            extracted_images_count=int(metadata.get("extracted_images_count", 0)),
            extraction_warnings=list(metadata.get("extraction_warnings", [])),
            content_hash=content_hash,
            size_bytes=size_bytes,
        )

    @staticmethod
    def delete_document(document_id: int) -> None:
        log_event(LOGGER, "database.delete_document.start", document_id=document_id)
        with Database.session() as session:
            session.execute(
                delete(Document).where(
                    Document.id == document_id,
                    Document.workspace_id == Database.workspace_id(),
                )
            )
        log_event(LOGGER, "database.delete_document.finish", document_id=document_id)

    @staticmethod
    def insert_chunks(document_id: int, chunks: list[dict[str, Any]]) -> None:
        log_blob(
            LOGGER,
            "database.insert_chunks.start",
            chunks,
            document_id=document_id,
            chunk_count=len(chunks),
        )
        if not chunks:
            log_event(
                LOGGER, "database.insert_chunks.skipped_empty", document_id=document_id
            )
            return
        with Database.session() as session:
            session.add_all(
                [
                    Chunk(
                        workspace_id=Database.workspace_id(),
                        document_id=document_id,
                        chunk_index=int(chunk["chunk_index"]),
                        page=int(chunk["page"]),
                        text=str(chunk["text"]),
                    )
                    for chunk in chunks
                ]
            )
        log_event(
            LOGGER,
            "database.insert_chunks.finish",
            document_id=document_id,
            chunk_count=len(chunks),
        )

    @staticmethod
    def insert_entities(document_id: int, entities: list[dict[str, Any]]) -> None:
        log_blob(
            LOGGER,
            "database.insert_entities.start",
            entities,
            document_id=document_id,
            entity_count=len(entities),
        )
        if not entities:
            log_event(
                LOGGER,
                "database.insert_entities.skipped_empty",
                document_id=document_id,
            )
            return
        with Database.session() as session:
            session.add_all(
                [
                    Entity(
                        workspace_id=Database.workspace_id(),
                        document_id=document_id,
                        page=int(item["page"]),
                        entity_type=str(item["entity_type"]),
                        value=str(item["value"]),
                        confidence=float(item["confidence"]),
                        context=str(item["context"]),
                    )
                    for item in entities
                ]
            )
        log_event(
            LOGGER,
            "database.insert_entities.finish",
            document_id=document_id,
            entity_count=len(entities),
        )

    @staticmethod
    def upsert_asset(asset: dict[str, Any]) -> None:
        log_blob(LOGGER, "database.upsert_asset.start", asset)
        values = {
            "workspace_id": Database.workspace_id(),
            "id": asset["id"],
            "name": asset["name"],
            "asset_type": asset["asset_type"],
            "location": asset["location"],
            "risk_level": asset["risk_level"],
            "last_inspection": asset.get("last_inspection"),
            "open_compliance_gaps": int(asset.get("open_compliance_gaps", 0)),
            "suggested_actions": list(asset.get("suggested_actions", [])),
            "source_document": str(asset.get("source_document", "")),
            "source_page": int(asset.get("source_page") or 1),
            "evidence_text": str(asset.get("evidence_text", "")),
        }
        statement = pg_insert(Asset).values(**values)
        excluded = statement.excluded
        statement = statement.on_conflict_do_update(
            index_elements=[Asset.workspace_id, Asset.id],
            set_={
                "name": excluded.name,
                "asset_type": excluded.asset_type,
                "location": excluded.location,
                "risk_level": excluded.risk_level,
                "last_inspection": excluded.last_inspection,
                "open_compliance_gaps": excluded.open_compliance_gaps,
                "suggested_actions": excluded.suggested_actions,
                "source_document": excluded.source_document,
                "source_page": excluded.source_page,
                "evidence_text": excluded.evidence_text,
            },
        )
        with Database.session() as session:
            session.execute(statement)
        log_event(LOGGER, "database.upsert_asset.finish", asset_id=asset["id"])

    @staticmethod
    def link_asset_document(asset_id: str, document_id: int) -> None:
        workspace_id = Database.workspace_id()
        log_event(
            LOGGER,
            "database.link_asset_document.start",
            asset_id=asset_id,
            document_id=document_id,
            workspace_id=workspace_id,
        )
        statement = (
            pg_insert(AssetDocument)
            .values(
                workspace_id=workspace_id,
                asset_id=asset_id,
                document_id=document_id,
            )
            .on_conflict_do_nothing(
                index_elements=["workspace_id", "asset_id", "document_id"]
            )
        )
        with Database.session() as session:
            session.execute(statement)
        log_event(
            LOGGER,
            "database.link_asset_document.finish",
            asset_id=asset_id,
            document_id=document_id,
        )

    @staticmethod
    def insert_timeline_events(events: list[dict[str, Any]]) -> None:
        log_blob(
            LOGGER,
            "database.insert_timeline_events.start",
            events,
            event_count=len(events),
        )
        if not events:
            log_event(LOGGER, "database.insert_timeline_events.skipped_empty")
            return
        with Database.session() as session:
            session.add_all(
                [
                    TimelineEvent(
                        workspace_id=Database.workspace_id(),
                        asset_id=str(event["asset_id"]),
                        event_date=str(event["event_date"]),
                        event_type=str(event["event_type"]),
                        title=str(event["title"]),
                        description=str(event["description"]),
                        source_document=str(event["source_document"]),
                        source_page=int(event.get("source_page", 1)),
                    )
                    for event in events
                ]
            )
        log_event(
            LOGGER,
            "database.insert_timeline_events.finish",
            event_count=len(events),
        )

    @staticmethod
    def insert_compliance_gaps(gaps: list[dict[str, Any]]) -> None:
        log_blob(
            LOGGER,
            "database.insert_compliance_gaps.start",
            gaps,
            gap_count=len(gaps),
        )
        if not gaps:
            log_event(LOGGER, "database.insert_compliance_gaps.skipped_empty")
            return
        with Database.session() as session:
            session.add_all(
                [
                    ComplianceGap(
                        workspace_id=Database.workspace_id(),
                        asset_id=str(gap["asset_id"]),
                        severity=str(gap["severity"]),
                        gap_type=str(gap["gap_type"]),
                        description=str(gap["description"]),
                        evidence=str(gap["evidence"]),
                        corrective_action=str(gap["corrective_action"]),
                        status=str(gap["status"]),
                        source_document=str(gap.get("source_document", "")),
                        source_page=int(gap.get("source_page", 1)),
                    )
                    for gap in gaps
                ]
            )
        log_event(
            LOGGER,
            "database.insert_compliance_gaps.finish",
            gap_count=len(gaps),
        )

    @staticmethod
    def replace_generated_analysis(result: dict[str, list[dict[str, Any]]]) -> None:
        started_at = time.perf_counter()
        workspace_id = Database.workspace_id()
        log_blob(
            LOGGER,
            "database.replace_generated_analysis.start",
            result,
            entities=len(result["entities"]),
            assets=len(result["assets"]),
            timeline_events=len(result["timeline_events"]),
            compliance_gaps=len(result["compliance_gaps"]),
            contradictions=len(result.get("contradictions", [])),
            workspace_id=workspace_id,
        )
        with Database.session() as session:
            log_event(LOGGER, "database.replace_generated_analysis.delete_graph_edges")
            session.execute(
                delete(GraphEdge).where(GraphEdge.workspace_id == workspace_id)
            )
            log_event(LOGGER, "database.replace_generated_analysis.delete_entities")
            session.execute(delete(Entity).where(Entity.workspace_id == workspace_id))
            log_event(
                LOGGER, "database.replace_generated_analysis.delete_asset_documents"
            )
            session.execute(
                delete(AssetDocument).where(AssetDocument.workspace_id == workspace_id)
            )
            log_event(
                LOGGER, "database.replace_generated_analysis.delete_timeline_events"
            )
            session.execute(
                delete(TimelineEvent).where(TimelineEvent.workspace_id == workspace_id)
            )
            log_event(
                LOGGER, "database.replace_generated_analysis.delete_compliance_gaps"
            )
            session.execute(
                delete(ComplianceGap).where(ComplianceGap.workspace_id == workspace_id)
            )
            log_event(
                LOGGER, "database.replace_generated_analysis.delete_contradictions"
            )
            session.execute(
                delete(Contradiction).where(Contradiction.workspace_id == workspace_id)
            )
            log_event(LOGGER, "database.replace_generated_analysis.delete_assets")
            session.execute(delete(Asset).where(Asset.workspace_id == workspace_id))
            session.add_all(
                [
                    Entity(
                        workspace_id=workspace_id,
                        document_id=int(item["document_id"]),
                        page=int(item["page"]),
                        entity_type=str(item["entity_type"]),
                        value=str(item["value"]),
                        confidence=float(item["confidence"]),
                        context=str(item["context"]),
                    )
                    for item in result["entities"]
                ]
            )
            log_event(
                LOGGER,
                "database.replace_generated_analysis.entities_added",
                count=len(result["entities"]),
            )
            assets = [
                Asset(
                    workspace_id=workspace_id,
                    id=str(asset["id"]),
                    name=str(asset["name"]),
                    asset_type=str(asset["asset_type"]),
                    location=str(asset["location"]),
                    risk_level=str(asset["risk_level"]),
                    last_inspection=asset.get("last_inspection"),
                    open_compliance_gaps=int(asset["open_compliance_gaps"]),
                    suggested_actions=list(asset["suggested_actions"]),
                    source_document=str(asset.get("source_document", "")),
                    source_page=int(asset.get("source_page") or 1),
                    evidence_text=str(asset.get("evidence_text", "")),
                )
                for asset in result["assets"]
            ]
            session.add_all(assets)
            session.flush()
            log_event(
                LOGGER,
                "database.replace_generated_analysis.assets_added",
                count=len(assets),
            )

            source_filenames = sorted(
                {
                    filename
                    for asset in result["assets"]
                    for filename in asset.get("_source_documents", set())
                }
            )
            documents_by_filename = {}
            if source_filenames:
                log_blob(
                    LOGGER,
                    "database.replace_generated_analysis.source_filenames",
                    source_filenames,
                )
                documents_by_filename = {
                    filename: document_id
                    for filename, document_id in session.execute(
                        select(Document.filename, Document.id).where(
                            Document.workspace_id == workspace_id,
                            Document.filename.in_(source_filenames),
                        )
                    ).all()
                }
                log_blob(
                    LOGGER,
                    "database.replace_generated_analysis.documents_by_filename",
                    documents_by_filename,
                )
            link_count = 0
            for asset in result["assets"]:
                for filename in sorted(asset.get("_source_documents", set())):
                    document_id = documents_by_filename.get(filename)
                    if document_id is not None:
                        link_count += 1
                        session.add(
                            AssetDocument(
                                workspace_id=workspace_id,
                                asset_id=str(asset["id"]),
                                document_id=int(document_id),
                            )
                        )
            log_event(
                LOGGER,
                "database.replace_generated_analysis.asset_documents_added",
                count=link_count,
            )

            session.add_all(
                [
                    TimelineEvent(
                        workspace_id=workspace_id,
                        asset_id=str(item["asset_id"]),
                        event_date=str(item["event_date"]),
                        event_type=str(item["event_type"]),
                        title=str(item["title"]),
                        description=str(item["description"]),
                        source_document=str(item["source_document"]),
                        source_page=int(item["source_page"]),
                    )
                    for item in result["timeline_events"]
                ]
            )
            log_event(
                LOGGER,
                "database.replace_generated_analysis.timeline_events_added",
                count=len(result["timeline_events"]),
            )
            session.add_all(
                [
                    ComplianceGap(
                        workspace_id=workspace_id,
                        asset_id=str(item["asset_id"]),
                        severity=str(item["severity"]),
                        gap_type=str(item["gap_type"]),
                        description=str(item["description"]),
                        evidence=str(item["evidence"]),
                        corrective_action=str(item["corrective_action"]),
                        status=str(item["status"]),
                        source_document=str(item["source_document"]),
                        source_page=int(item["source_page"]),
                    )
                    for item in result["compliance_gaps"]
                ]
            )
            log_event(
                LOGGER,
                "database.replace_generated_analysis.compliance_gaps_added",
                count=len(result["compliance_gaps"]),
            )
            contradictions = result.get("contradictions", [])
            session.add_all(
                [
                    Contradiction(
                        workspace_id=workspace_id,
                        asset_id=str(item["asset_id"]),
                        severity=str(item["severity"]),
                        contradiction_type=str(item["contradiction_type"]),
                        description=str(item["description"]),
                        evidence_a=str(item["evidence_a"]),
                        source_document_a=str(item["source_document_a"]),
                        source_page_a=int(item["source_page_a"]),
                        evidence_b=str(item["evidence_b"]),
                        source_document_b=str(item["source_document_b"]),
                        source_page_b=int(item["source_page_b"]),
                        status=str(item["status"]),
                    )
                    for item in contradictions
                ]
            )
            log_event(
                LOGGER,
                "database.replace_generated_analysis.contradictions_added",
                count=len(contradictions),
            )
        log_event(
            LOGGER,
            "database.replace_generated_analysis.finish",
            elapsed_seconds=round(time.perf_counter() - started_at, 3),
        )

    @staticmethod
    def replace_graph_edges(edges: list[dict[str, Any]]) -> None:
        workspace_id = Database.workspace_id()
        log_blob(
            LOGGER,
            "database.replace_graph_edges.start",
            edges,
            count=len(edges),
            workspace_id=workspace_id,
        )
        with Database.session() as session:
            session.execute(
                delete(GraphEdge).where(GraphEdge.workspace_id == workspace_id)
            )
            session.add_all(
                [
                    GraphEdge(
                        workspace_id=workspace_id,
                        source_id=str(edge.get("source_id") or edge["source_node"]),
                        target_id=str(edge.get("target_id") or edge["target_node"]),
                        label=str(edge["label"]),
                        relation_type=str(edge["relation_type"]),
                        confidence=float(edge["confidence"]),
                        source_document=str(edge.get("source_document", "")),
                        source_page=int(edge.get("source_page") or 1),
                        evidence_text=str(edge.get("evidence_text", "")),
                        validation_status=str(edge["validation_status"]),
                        validation_reason=str(edge.get("validation_reason", "")),
                    )
                    for edge in edges
                ]
            )
        log_event(LOGGER, "database.replace_graph_edges.finish", count=len(edges))

    @staticmethod
    def list_graph_edges() -> list[dict[str, Any]]:
        result = Database.rows(
            """
            SELECT *
            FROM graph_edges
            WHERE workspace_id = ?
            ORDER BY id
            """,
            (Database.workspace_id(),),
        )
        for edge in result:
            edge["confidence"] = float(edge.get("confidence") or 0.0)
            edge["source_page"] = int(edge.get("source_page") or 1)
            edge["source_node"] = str(edge.get("source_id") or "")
            edge["target_node"] = str(edge.get("target_id") or "")
        log_blob(LOGGER, "database.list_graph_edges", result, count=len(result))
        return result

    @staticmethod
    def list_contradictions(asset_id: str | None = None) -> list[dict[str, Any]]:
        workspace_id = Database.workspace_id()
        if asset_id:
            result = Database.rows(
                """
                SELECT *
                FROM contradictions
                WHERE workspace_id = ? AND asset_id = ?
                ORDER BY
                    CASE severity
                        WHEN 'High' THEN 1
                        WHEN 'Medium' THEN 2
                        WHEN 'Low' THEN 3
                        ELSE 4
                    END,
                    id DESC
                """,
                (workspace_id, asset_id.upper()),
            )
        else:
            result = Database.rows(
                """
                SELECT *
                FROM contradictions
                WHERE workspace_id = ?
                ORDER BY
                    CASE severity
                        WHEN 'High' THEN 1
                        WHEN 'Medium' THEN 2
                        WHEN 'Low' THEN 3
                        ELSE 4
                    END,
                    asset_id,
                    id DESC
                """,
                (workspace_id,),
            )
        for row in result:
            row["source_page_a"] = int(row.get("source_page_a") or 1)
            row["source_page_b"] = int(row.get("source_page_b") or 1)
        log_blob(
            LOGGER,
            "database.list_contradictions",
            result,
            asset_id=asset_id,
            count=len(result),
        )
        return result

    @staticmethod
    def update_chunk_embeddings(
        document_id: int, embeddings: list[tuple[int, list[float]]]
    ) -> None:
        log_blob(
            LOGGER,
            "database.update_chunk_embeddings.start",
            embeddings,
            document_id=document_id,
            embedding_count=len(embeddings),
        )
        if not embeddings:
            log_event(
                LOGGER,
                "database.update_chunk_embeddings.skipped_empty",
                document_id=document_id,
            )
            return
        with Database.session() as session:
            for chunk_index, embedding in embeddings:
                session.execute(
                    update(Chunk)
                    .where(
                        Chunk.workspace_id == Database.workspace_id(),
                        Chunk.document_id == document_id,
                        Chunk.chunk_index == chunk_index,
                    )
                    .values(embedding=embedding)
                )
        log_event(
            LOGGER,
            "database.update_chunk_embeddings.finish",
            document_id=document_id,
            embedding_count=len(embeddings),
        )

    @staticmethod
    def search_chunks(
        embedding: list[float],
        filters: dict[str, Any] | None = None,
        limit: int = 6,
    ) -> list[dict[str, Any]]:
        started_at = time.perf_counter()
        filters = filters or {}
        log_blob(
            LOGGER,
            "database.search_chunks.start",
            embedding,
            filters=filters,
            limit=limit,
        )
        distance = Chunk.embedding.cosine_distance(embedding).label("distance")
        statement = (
            select(
                Chunk.text,
                Chunk.document_id,
                Chunk.page,
                Chunk.chunk_index,
                Document.filename,
                Document.document_type,
                distance,
            )
            .join(Document, Document.id == Chunk.document_id)
            .where(
                Chunk.workspace_id == Database.workspace_id(),
                Document.workspace_id == Database.workspace_id(),
                Chunk.embedding.is_not(None),
            )
            .order_by(distance)
            .limit(limit)
        )
        document_type = filters.get("document_type")
        if document_type:
            statement = statement.where(
                func.upper(Document.document_type) == str(document_type).upper()
            )
        with Database.session() as session:
            matches = []
            for row in session.execute(statement).all():
                distance_value = float(row.distance)
                match = {
                    "text": row.text,
                    "metadata": {
                        "document_id": row.document_id,
                        "filename": row.filename,
                        "document_type": row.document_type,
                        "page": row.page,
                        "chunk_index": row.chunk_index,
                    },
                    "score": max(0.0, 1.0 - distance_value),
                }
                log_blob(LOGGER, "database.search_chunks.match", match)
                matches.append(match)
            log_blob(
                LOGGER,
                "database.search_chunks.finish",
                matches,
                result_count=len(matches),
                elapsed_seconds=round(time.perf_counter() - started_at, 3),
            )
            return matches

    @staticmethod
    def list_chunks_missing_embeddings(limit: int = 512) -> list[dict[str, Any]]:
        started_at = time.perf_counter()
        log_event(LOGGER, "database.list_chunks_missing_embeddings.start", limit=limit)
        statement = (
            select(
                Chunk.id,
                Chunk.document_id,
                Chunk.chunk_index,
                Chunk.page,
                Chunk.text,
                Document.filename,
                Document.document_type,
            )
            .join(Document, Document.id == Chunk.document_id)
            .where(
                Chunk.workspace_id == Database.workspace_id(),
                Document.workspace_id == Database.workspace_id(),
                Chunk.embedding.is_(None),
            )
            .order_by(Chunk.id)
            .limit(limit)
        )
        with Database.session() as session:
            result = [
                {
                    "id": row.id,
                    "document_id": row.document_id,
                    "chunk_index": row.chunk_index,
                    "page": row.page,
                    "text": row.text,
                    "filename": row.filename,
                    "document_type": row.document_type,
                }
                for row in session.execute(statement).all()
            ]
        log_blob(
            LOGGER,
            "database.list_chunks_missing_embeddings.finish",
            result,
            chunk_count=len(result),
            elapsed_seconds=round(time.perf_counter() - started_at, 3),
        )
        return result

    @staticmethod
    def rows(query: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
        started_at = time.perf_counter()
        log_event(
            LOGGER,
            "database.rows.start",
            query=query,
            params=params,
            schema=Settings.database_schema(),
        )
        statement, values = Database._statement(query, params)
        with Database.engine().begin() as connection:
            Database._set_connection_schema(connection)
            result = connection.execute(statement, values)
            rows = [dict(row) for row in result.mappings().all()]
        log_blob(
            LOGGER,
            "database.rows.finish",
            rows,
            query=query,
            params=params,
            row_count=len(rows),
            elapsed_seconds=round(time.perf_counter() - started_at, 3),
        )
        return rows

    @staticmethod
    def row(query: str, params: tuple[Any, ...] = ()) -> dict[str, Any] | None:
        started_at = time.perf_counter()
        log_event(
            LOGGER,
            "database.row.start",
            query=query,
            params=params,
            schema=Settings.database_schema(),
        )
        statement, values = Database._statement(query, params)
        with Database.engine().begin() as connection:
            Database._set_connection_schema(connection)
            result = connection.execute(statement, values).mappings().first()
            row = dict(result) if result else None
        log_blob(
            LOGGER,
            "database.row.finish",
            row,
            query=query,
            params=params,
            found=bool(row),
            elapsed_seconds=round(time.perf_counter() - started_at, 3),
        )
        return row

    @staticmethod
    def _set_session_schema(session: Session) -> None:
        schema = Settings.database_schema()
        if schema:
            log_event(LOGGER, "database.session.set_schema", schema=schema)
            session.execute(text(f'SET LOCAL search_path TO "{schema}", public'))

    @staticmethod
    def _set_connection_schema(connection: Connection) -> None:
        schema = Settings.database_schema()
        if schema:
            log_event(LOGGER, "database.connection.set_schema", schema=schema)
            connection.execute(text(f'SET LOCAL search_path TO "{schema}", public'))

    @staticmethod
    def _statement(query: str, params: tuple[Any, ...]) -> tuple[Any, dict[str, Any]]:
        if not params:
            log_event(LOGGER, "database.statement", query=query, values={})
            return text(query), {}
        parts = query.split("?")
        if len(parts) - 1 != len(params):
            raise ValueError("SQL placeholder count does not match parameters.")
        rewritten = parts[0]
        values: dict[str, Any] = {}
        for index, value in enumerate(params):
            name = f"p{index}"
            rewritten += f":{name}{parts[index + 1]}"
            values[name] = value
        log_event(LOGGER, "database.statement", query=rewritten, values=values)
        return text(rewritten), values

    @staticmethod
    def list_documents() -> list[dict[str, Any]]:
        workspace_id = Database.workspace_id()
        log_event(LOGGER, "database.list_documents.start", workspace_id=workspace_id)
        documents = Database.rows(
            """
            SELECT id, filename, document_type, upload_time, page_count,
                   LENGTH(parsed_text) AS character_count, parser, ocr_used,
                   ocr_engine, ocr_confidence, extracted_tables_count,
                   extracted_images_count, extraction_warnings, size_bytes
            FROM documents
            WHERE workspace_id = ?
            ORDER BY id DESC
            """,
            (workspace_id,),
        )
        for document in documents:
            normalise_document_metadata(document)
        log_blob(
            LOGGER,
            "database.list_documents.finish",
            documents,
            document_count=len(documents),
        )
        return documents

    @staticmethod
    def get_document(document_id: int) -> dict[str, Any] | None:
        workspace_id = Database.workspace_id()
        log_event(
            LOGGER,
            "database.get_document.start",
            document_id=document_id,
            workspace_id=workspace_id,
        )
        document = Database.row(
            "SELECT * FROM documents WHERE workspace_id = ? AND id = ?",
            (workspace_id, document_id),
        )
        if document:
            normalise_document_metadata(document)
        log_blob(
            LOGGER, "database.get_document.finish", document, document_id=document_id
        )
        return document

    @staticmethod
    def list_chunks(document_id: int | None = None) -> list[dict[str, Any]]:
        workspace_id = Database.workspace_id()
        log_event(
            LOGGER,
            "database.list_chunks.start",
            document_id=document_id,
            workspace_id=workspace_id,
        )
        if document_id is None:
            result = Database.rows(
                """
                SELECT chunks.id, chunks.document_id, chunks.chunk_index, chunks.page,
                       chunks.text, documents.filename, documents.document_type
                FROM chunks
                JOIN documents ON documents.id = chunks.document_id
                    AND documents.workspace_id = chunks.workspace_id
                WHERE chunks.workspace_id = ?
                ORDER BY chunks.id
                """,
                (workspace_id,),
            )
            log_blob(
                LOGGER,
                "database.list_chunks.finish",
                result,
                document_id=document_id,
                chunk_count=len(result),
            )
            return result
        result = Database.rows(
            """
            SELECT chunks.id, chunks.document_id, chunks.chunk_index, chunks.page,
                   chunks.text, documents.filename, documents.document_type
            FROM chunks
            JOIN documents ON documents.id = chunks.document_id
                AND documents.workspace_id = chunks.workspace_id
            WHERE chunks.workspace_id = ? AND document_id = ?
            ORDER BY chunk_index
            """,
            (workspace_id, document_id),
        )
        log_blob(
            LOGGER,
            "database.list_chunks.finish",
            result,
            document_id=document_id,
            chunk_count=len(result),
        )
        return result

    @staticmethod
    def list_entities(document_id: int | None = None) -> list[dict[str, Any]]:
        workspace_id = Database.workspace_id()
        log_event(
            LOGGER,
            "database.list_entities.start",
            document_id=document_id,
            workspace_id=workspace_id,
        )
        if document_id is None:
            result = Database.rows(
                """
                SELECT entities.*, documents.filename
                FROM entities
                JOIN documents ON documents.id = entities.document_id
                    AND documents.workspace_id = entities.workspace_id
                WHERE entities.workspace_id = ?
                ORDER BY entities.entity_type, entities.value
                """,
                (workspace_id,),
            )
            log_blob(
                LOGGER,
                "database.list_entities.finish",
                result,
                document_id=document_id,
                entity_count=len(result),
            )
            return result
        result = Database.rows(
            """
            SELECT entities.*, documents.filename
            FROM entities
            JOIN documents ON documents.id = entities.document_id
                AND documents.workspace_id = entities.workspace_id
            WHERE entities.workspace_id = ? AND document_id = ?
            ORDER BY entities.entity_type, entities.value
            """,
            (workspace_id, document_id),
        )
        log_blob(
            LOGGER,
            "database.list_entities.finish",
            result,
            document_id=document_id,
            entity_count=len(result),
        )
        return result

    @staticmethod
    def list_assets() -> list[dict[str, Any]]:
        workspace_id = Database.workspace_id()
        log_event(LOGGER, "database.list_assets.start", workspace_id=workspace_id)
        assets = Database.rows(
            """
            SELECT *
            FROM assets
            WHERE workspace_id = ?
            ORDER BY
                CASE risk_level
                    WHEN 'High' THEN 1
                    WHEN 'Medium' THEN 2
                    WHEN 'Low' THEN 3
                    ELSE 4
                END,
                id
        """,
            (workspace_id,),
        )
        for asset in assets:
            normalise_asset(asset)
        log_blob(LOGGER, "database.list_assets.finish", assets, asset_count=len(assets))
        return assets

    @staticmethod
    def get_asset(asset_id: str) -> dict[str, Any] | None:
        workspace_id = Database.workspace_id()
        log_event(
            LOGGER,
            "database.get_asset.start",
            asset_id=asset_id,
            workspace_id=workspace_id,
        )
        asset = Database.row(
            "SELECT * FROM assets WHERE workspace_id = ? AND id = ?",
            (workspace_id, asset_id),
        )
        if asset:
            normalise_asset(asset)
        log_blob(LOGGER, "database.get_asset.finish", asset, asset_id=asset_id)
        return asset


def normalise_document_metadata(document: dict[str, Any]) -> None:
    document["ocr_used"] = bool(document.get("ocr_used"))
    warnings = document.get("extraction_warnings")
    if isinstance(warnings, str):
        try:
            document["extraction_warnings"] = json.loads(warnings or "[]")
        except json.JSONDecodeError:
            document["extraction_warnings"] = [warnings] if warnings else []
    elif warnings is None:
        document["extraction_warnings"] = []
    else:
        document["extraction_warnings"] = list(warnings)


def normalise_asset(asset: dict[str, Any]) -> None:
    actions = asset.get("suggested_actions")
    if isinstance(actions, str):
        try:
            asset["suggested_actions"] = json.loads(actions or "[]")
        except json.JSONDecodeError:
            asset["suggested_actions"] = [actions] if actions else []
    elif actions is None:
        asset["suggested_actions"] = []
    else:
        asset["suggested_actions"] = list(actions)
    asset["source_document"] = str(asset.get("source_document") or "")
    asset["source_page"] = int(asset.get("source_page") or 1)
    asset["evidence_text"] = str(asset.get("evidence_text") or "")
