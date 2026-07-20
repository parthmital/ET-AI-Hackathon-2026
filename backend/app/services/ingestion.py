from __future__ import annotations

import hashlib
import logging
import time
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import UploadFile

from app.services.chunker import chunk_pages
from app.services.database import Database
from app.services.parsers import SUPPORTED_EXTENSIONS, parse_document
from app.services.terminal_logging import log_blob, log_event
from app.services.vector_store import vector_store
from app.settings import Settings

LOGGER = logging.getLogger(__name__)
ALLOWED_CONTENT_TYPES = {
    ".pdf": {"", "application/pdf", "application/octet-stream"},
    ".docx": {
        "",
        "application/octet-stream",
        "application/zip",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    },
    ".xlsx": {
        "",
        "application/octet-stream",
        "application/zip",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
    ".txt": {"", "application/octet-stream", "text/plain"},
    ".csv": {
        "",
        "application/csv",
        "application/octet-stream",
        "application/vnd.ms-excel",
        "text/csv",
        "text/plain",
    },
}
ZIP_REQUIRED_PREFIXES = {
    ".docx": "word/",
    ".xlsx": "xl/",
}


async def ingest_files(files: list[UploadFile]) -> dict[str, Any]:
    started_at = time.perf_counter()
    log_event(
        LOGGER,
        "ingestion.batch.start",
        file_count=len(files),
        filenames=[file.filename for file in files],
    )
    items: list[dict[str, Any]] = []
    for index, file in enumerate(files, start=1):
        log_event(
            LOGGER,
            "ingestion.batch.file.start",
            index=index,
            total=len(files),
            filename=file.filename,
            content_type=file.content_type,
        )
        try:
            item = await ingest_file(file)
            log_blob(
                LOGGER,
                "ingestion.batch.file.result",
                item,
                index=index,
                total=len(files),
            )
            items.append(item)
        except Exception as exc:
            item = {
                "filename": safe_filename(file.filename or "") or "Unnamed file",
                "status": "failed",
                "message": str(exc) or "Document could not be processed.",
            }
            log_blob(
                LOGGER,
                "ingestion.batch.file.failed",
                item,
                level=logging.ERROR,
                index=index,
                total=len(files),
                error_type=type(exc).__name__,
            )
            items.append(item)
    result = {
        "total_files": len(items),
        "uploaded_count": sum(item["status"] == "uploaded" for item in items),
        "duplicate_count": sum(item["status"] == "duplicate" for item in items),
        "failed_count": sum(item["status"] == "failed" for item in items),
        "items": items,
    }
    log_blob(
        LOGGER,
        "ingestion.batch.finish",
        result,
        elapsed_seconds=round(time.perf_counter() - started_at, 3),
    )
    return result


async def ingest_file(file: UploadFile) -> dict[str, Any]:
    started_at = time.perf_counter()
    filename = safe_filename(file.filename or "")
    if not filename:
        raise ValueError("Filename is required.")
    extension = Path(filename).suffix.lower()
    if extension not in SUPPORTED_EXTENSIONS:
        raise ValueError(f"Unsupported file type: {extension or 'none'}")
    target = unique_upload_path(Settings.upload_dir / filename)
    staging = target.with_name(f".{target.stem}.uploading{target.suffix}")
    max_size = Settings.max_upload_size_bytes()
    total_bytes = 0
    log_event(
        LOGGER,
        "ingestion.file.validated",
        original_filename=file.filename,
        safe_filename=filename,
        extension=extension,
        target=str(target),
        staging=str(staging),
        max_size_bytes=max_size,
    )
    try:
        read_count = 0
        with staging.open("wb") as output:
            while content := await file.read(1024 * 1024):
                read_count += 1
                total_bytes += len(content)
                if total_bytes > max_size:
                    raise ValueError(
                        f"File is too large. Maximum upload size is {max_size // (1024 * 1024)} MB."
                    )
                output.write(content)
                log_event(
                    LOGGER,
                    "ingestion.file.bytes_read",
                    filename=filename,
                    read_count=read_count,
                    chunk_bytes=len(content),
                    total_bytes=total_bytes,
                )
        if total_bytes == 0:
            raise ValueError("File is empty.")

        result = ingest_staged_file(
            staging,
            original_filename=filename,
            content_type=file.content_type or "",
            local_target=target,
            size_bytes=total_bytes,
        )
        log_blob(
            LOGGER,
            "ingestion.file.finish",
            result,
            elapsed_seconds=round(time.perf_counter() - started_at, 3),
        )
        return result
    finally:
        staging.unlink(missing_ok=True)
        log_event(
            LOGGER,
            "ingestion.file.staging_cleanup",
            staging=str(staging),
            elapsed_seconds=round(time.perf_counter() - started_at, 3),
        )


def ingest_staged_file(
    path: Path,
    original_filename: str,
    content_type: str = "",
    local_target: Path | None = None,
    size_bytes: int | None = None,
) -> dict[str, Any]:
    started_at = time.perf_counter()
    filename = safe_filename(original_filename)
    if not filename:
        raise ValueError("Filename is required.")
    extension = Path(filename).suffix.lower()
    if extension not in SUPPORTED_EXTENSIONS:
        raise ValueError(f"Unsupported file type: {extension or 'none'}")
    actual_size = path.stat().st_size
    max_size = Settings.max_upload_size_bytes()
    if actual_size <= 0:
        raise ValueError("File is empty.")
    if size_bytes is not None and int(size_bytes) != actual_size:
        raise ValueError("Uploaded file size did not match the expected size.")
    if actual_size > max_size:
        raise ValueError(
            f"File is too large. Maximum upload size is {max_size // (1024 * 1024)} MB."
        )
    validate_upload_content(path, extension, content_type)
    digest = hashlib.sha256()
    with path.open("rb") as source:
        while content := source.read(1024 * 1024):
            digest.update(content)
    content_hash = digest.hexdigest()
    log_event(
        LOGGER,
        "ingestion.file.hash_complete",
        filename=filename,
        content_type=content_type,
        total_bytes=actual_size,
        sha256=content_hash,
    )
    duplicate = Database.find_document_by_hash(content_hash)
    if duplicate:
        result = {
            "filename": filename,
            "status": "duplicate",
            "document_id": duplicate["id"],
            "stored_filename": duplicate["filename"],
            "sha256": content_hash,
            "message": "Exact file content is already in the workspace.",
        }
        log_blob(LOGGER, "ingestion.file.duplicate", result)
        return result

    parsed = parse_document(path)
    log_blob(
        LOGGER,
        "ingestion.file.parsed_text",
        parsed["text"],
        filename=filename,
        page_count=parsed["page_count"],
        metadata=parsed.get("metadata"),
    )
    log_blob(
        LOGGER,
        "ingestion.file.parsed_pages",
        parsed["pages"],
        filename=filename,
    )
    chunks = chunk_pages(parsed["pages"])
    log_blob(
        LOGGER,
        "ingestion.file.chunks",
        chunks,
        filename=filename,
        chunk_count=len(chunks),
    )
    document_type = extension.removeprefix(".").upper()
    stored_filename = local_target.name if local_target else filename
    document_id = Database.insert_ingested_document(
        filename=stored_filename,
        document_type=document_type,
        parsed_text=parsed["text"],
        page_count=parsed["page_count"],
        content_hash=content_hash,
        chunks=chunks,
        parser_metadata=parsed.get("metadata"),
        size_bytes=actual_size,
    )
    try:
        vector_store.add_chunks(document_id, chunks)
        if local_target:
            path.replace(local_target)
            log_event(
                LOGGER,
                "ingestion.file.stored",
                filename=filename,
                stored_filename=local_target.name,
                target=str(local_target),
            )
    except Exception:
        Database.delete_document(document_id)
        raise
    result = {
        "filename": filename,
        "stored_filename": stored_filename,
        "status": "uploaded",
        "document_id": document_id,
        "document_type": document_type,
        "chunk_count": len(chunks),
        "page_count": parsed["page_count"],
        "sha256": content_hash,
        "message": "Document parsed and indexed.",
    }
    log_blob(
        LOGGER,
        "ingestion.file.finish",
        result,
        elapsed_seconds=round(time.perf_counter() - started_at, 3),
    )
    return result


def clear_workspace() -> dict[str, Any]:
    log_event(
        LOGGER, "ingestion.clear_workspace.start", upload_dir=str(Settings.upload_dir)
    )
    stored_filenames = {
        safe_filename(str(document.get("filename", "")))
        for document in Database.list_documents()
    }
    stored_filenames.discard("")
    Database.clear_workspace()
    for filename in sorted(stored_filenames):
        path = Settings.upload_dir / filename
        log_event(LOGGER, "ingestion.clear_workspace.unlink_file", path=str(path))
        path.unlink(missing_ok=True)
    result = {"status": "cleared"}
    log_blob(LOGGER, "ingestion.clear_workspace.finish", result)
    return result


def validate_upload_content(path: Path, extension: str, content_type: str = "") -> None:
    normalised_content_type = content_type.split(";", 1)[0].strip().lower()
    allowed_content_types = ALLOWED_CONTENT_TYPES.get(extension, {""})
    if normalised_content_type not in allowed_content_types:
        raise ValueError(
            f"Unsupported MIME type for {extension}: {normalised_content_type or 'none'}"
        )
    if extension == ".pdf":
        with path.open("rb") as source:
            if source.read(5) != b"%PDF-":
                raise ValueError("PDF signature validation failed.")
        return
    if extension in ZIP_REQUIRED_PREFIXES:
        if not zipfile.is_zipfile(path):
            raise ValueError(f"{extension} file is not a valid ZIP container.")
        required_prefix = ZIP_REQUIRED_PREFIXES[extension]
        with zipfile.ZipFile(path) as archive:
            names = set(archive.namelist())
        if "[Content_Types].xml" not in names or not any(
            name.startswith(required_prefix) for name in names
        ):
            raise ValueError(f"{extension} file signature validation failed.")
        return
    with path.open("rb") as source:
        sample = source.read(8192)
    if b"\x00" in sample:
        raise ValueError(f"{extension} file appears to be binary.")
    try:
        sample.decode("utf-8")
    except UnicodeDecodeError:
        sample.decode("cp1252")


def safe_filename(filename: str) -> str:
    clean = "".join(
        character
        for character in Path(filename).name
        if character.isalnum() or character in " ._-()"
    ).strip()
    return clean[:160]


def unique_upload_path(path: Path) -> Path:
    if not path.exists():
        return path
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    candidate = path.with_name(f"{path.stem}-{stamp}{path.suffix}")
    counter = 2
    while candidate.exists():
        candidate = path.with_name(f"{path.stem}-{stamp}-{counter}{path.suffix}")
        counter += 1
    return candidate
