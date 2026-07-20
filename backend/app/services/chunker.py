from __future__ import annotations

import logging
from typing import Any

from app.services.terminal_logging import log_blob, log_event

LOGGER = logging.getLogger(__name__)


def chunk_pages(
    pages: list[dict[str, Any]], max_words: int = 130, overlap: int = 25
) -> list[dict[str, Any]]:
    log_event(
        LOGGER,
        "chunker.start",
        page_count=len(pages),
        max_words=max_words,
        overlap=overlap,
    )
    chunks: list[dict[str, Any]] = []
    chunk_index = 0
    step = max(max_words - overlap, 1)
    for page in pages:
        words = page["text"].split()
        log_event(
            LOGGER,
            "chunker.page.start",
            page=page["page"],
            word_count=len(words),
            character_count=len(page["text"]),
        )
        if not words:
            continue
        for start in range(0, len(words), step):
            segment = words[start : start + max_words]
            if not segment:
                continue
            chunk = {
                "chunk_index": chunk_index,
                "page": int(page["page"]),
                "text": " ".join(segment),
            }
            chunks.append(chunk)
            log_blob(
                LOGGER,
                "chunker.chunk.created",
                chunk,
                start_word=start,
                end_word=start + len(segment),
                word_count=len(segment),
            )
            chunk_index += 1
            if start + max_words >= len(words):
                break
    log_blob(LOGGER, "chunker.finish", chunks, chunk_count=len(chunks))
    return chunks
