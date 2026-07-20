from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, File, HTTPException, UploadFile

from app.core.terminal_logging import log_blob, log_event
from app.services.database import Database
from app.services.ingestion import ingest_files

LOGGER = logging.getLogger(__name__)
router = APIRouter()


@router.post("/documents/upload-batch")
async def upload_documents(files: list[UploadFile] = File(...)) -> dict[str, Any]:
    if not files:
        raise HTTPException(status_code=400, detail="At least one file is required.")
    log_event(
        LOGGER,
        "endpoint.documents.upload_batch.start",
        file_count=len(files),
        filenames=[file.filename for file in files],
        content_types=[file.content_type for file in files],
    )
    try:
        result = await ingest_files(files)
        log_blob(LOGGER, "endpoint.documents.upload_batch.response", result)
        return result
    except Exception as exc:
        LOGGER.exception("Document batch upload failed.")
        raise HTTPException(
            status_code=500,
            detail="Document batch could not be processed.",
        ) from exc


@router.get("/documents")
def documents() -> list[dict[str, Any]]:
    result = Database.list_documents()
    log_blob(LOGGER, "endpoint.documents.list.response", result, count=len(result))
    return result


@router.get("/documents/{document_id}")
def document_detail(document_id: int) -> dict[str, Any]:
    log_event(LOGGER, "endpoint.document_detail.start", document_id=document_id)
    document = Database.get_document(document_id)
    if not document:
        raise HTTPException(status_code=404, detail="Document not found.")
    document["chunks"] = Database.list_chunks(document_id=document_id)
    document["entities"] = Database.list_entities(document_id=document_id)
    log_blob(LOGGER, "endpoint.document_detail.response", document)
    return document


@router.get("/entities")
def entities() -> list[dict[str, Any]]:
    result = Database.list_entities()
    log_blob(LOGGER, "endpoint.entities.response", result, count=len(result))
    return result
