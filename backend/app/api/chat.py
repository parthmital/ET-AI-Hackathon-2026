from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter

from app.api.errors import raise_llm_unavailable, raise_unprocessable
from app.core.terminal_logging import log_blob
from app.services.intelligence import run_chat
from app.services.llm import LLMConfigurationError
from app.types import ChatRequest

LOGGER = logging.getLogger(__name__)
router = APIRouter()


@router.post("/chat")
def chat(request: ChatRequest) -> dict[str, Any]:
    log_blob(LOGGER, "endpoint.chat.request", request.model_dump())
    try:
        result = run_chat(request)
        log_blob(LOGGER, "endpoint.chat.response", result)
        return result
    except ValueError as exc:
        LOGGER.warning("Chat request rejected. error=%s", exc)
        raise_unprocessable(exc)
    except (LLMConfigurationError, RuntimeError) as exc:
        raise_llm_unavailable("Chat request", exc)
