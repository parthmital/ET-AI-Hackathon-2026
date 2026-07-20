from __future__ import annotations

import logging
import time
from collections import defaultdict
from typing import Any

from app.services.database import Database
from app.services.embeddings import EmbeddingProvider, get_embedding_provider
from app.services.terminal_logging import log_blob, log_event

LOGGER = logging.getLogger(__name__)
MAX_BACKFILL_CHUNKS = 512


class VectorStore:
    def add_chunks(self, document_id: int, chunks: list[dict[str, Any]]) -> None:
        started_at = time.perf_counter()
        log_blob(
            LOGGER,
            "vector_store.add_chunks.start",
            chunks,
            document_id=document_id,
            chunk_count=len(chunks),
        )
        if not chunks:
            log_event(LOGGER, "vector_store.add_chunks.skipped_empty")
            return
        provider = get_embedding_provider()
        embeddings = provider.embed([chunk["text"] for chunk in chunks])
        Database.update_chunk_embeddings(
            document_id,
            [
                (int(chunk["chunk_index"]), embedding)
                for chunk, embedding in zip(chunks, embeddings)
            ],
        )
        log_event(
            LOGGER,
            "vector_store.add_chunks.finish",
            document_id=document_id,
            chunk_count=len(chunks),
            elapsed_seconds=round(time.perf_counter() - started_at, 3),
        )

    def backfill_missing_embeddings(self, provider: EmbeddingProvider) -> None:
        started_at = time.perf_counter()
        chunks = Database.list_chunks_missing_embeddings(limit=MAX_BACKFILL_CHUNKS)
        if not chunks:
            log_event(LOGGER, "vector_store.backfill_missing_embeddings.skipped_empty")
            return
        log_blob(
            LOGGER,
            "vector_store.backfill_missing_embeddings.start",
            chunks,
            chunk_count=len(chunks),
        )
        embeddings = provider.embed([chunk["text"] for chunk in chunks])
        updates_by_document: dict[int, list[tuple[int, list[float]]]] = defaultdict(
            list
        )
        for chunk, embedding in zip(chunks, embeddings):
            updates_by_document[int(chunk["document_id"])].append(
                (int(chunk["chunk_index"]), embedding)
            )
        for document_id, updates in updates_by_document.items():
            Database.update_chunk_embeddings(document_id, updates)
        log_event(
            LOGGER,
            "vector_store.backfill_missing_embeddings.finish",
            chunk_count=len(chunks),
            document_count=len(updates_by_document),
            elapsed_seconds=round(time.perf_counter() - started_at, 3),
        )

    def query(
        self, text: str, filters: dict[str, Any] | None = None, limit: int = 6
    ) -> list[dict[str, Any]]:
        started_at = time.perf_counter()
        log_blob(
            LOGGER,
            "vector_store.query.start",
            text,
            filters=filters or {},
            limit=limit,
        )
        provider = get_embedding_provider()
        self.backfill_missing_embeddings(provider)
        embedding = provider.embed([text])[0]
        results = Database.search_chunks(embedding, filters, limit)
        log_blob(
            LOGGER,
            "vector_store.query.finish",
            results,
            result_count=len(results),
            elapsed_seconds=round(time.perf_counter() - started_at, 3),
        )
        return results


vector_store = VectorStore()
