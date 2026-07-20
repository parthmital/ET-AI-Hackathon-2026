from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter

from app.api.errors import raise_llm_unavailable, raise_unprocessable
from app.core.terminal_logging import log_blob
from app.services.intelligence import run_rca
from app.services.llm import LLMConfigurationError
from app.types import RCARequest

LOGGER = logging.getLogger(__name__)
router = APIRouter()


@router.post("/rca")
def rca(request: RCARequest) -> dict[str, Any]:
    log_blob(LOGGER, "endpoint.rca.request", request.model_dump())
    try:
        result = run_rca(request)
        log_blob(LOGGER, "endpoint.rca.response", result)
        return result
    except ValueError as exc:
        LOGGER.warning("RCA request rejected. error=%s", exc)
        raise_unprocessable(exc)
    except (LLMConfigurationError, RuntimeError) as exc:
        raise_llm_unavailable("RCA request", exc)
