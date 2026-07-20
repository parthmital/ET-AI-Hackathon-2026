from __future__ import annotations

import logging

from fastapi import HTTPException

from app.core.terminal_logging import (
    is_trace_enabled,
    to_log_json,
    to_summary_json,
)
from app.services.llm import (
    LLMProviderError,
    public_llm_error_message,
)

LOGGER = logging.getLogger(__name__)


def raise_unprocessable(exc: ValueError) -> None:
    raise HTTPException(status_code=422, detail=str(exc)) from exc


def raise_llm_unavailable(operation: str, exc: Exception) -> None:
    public_message = public_llm_error_message(exc)
    if isinstance(exc, LLMProviderError):
        diagnostics = (
            to_log_json(exc.diagnostics)
            if is_trace_enabled(LOGGER)
            else to_summary_json(exc.diagnostics)
        )
        LOGGER.error("%s LLM diagnostics: %s", operation, diagnostics)
    LOGGER.exception("%s failed. public_message=%s", operation, public_message)
    raise HTTPException(status_code=503, detail=public_message) from exc
