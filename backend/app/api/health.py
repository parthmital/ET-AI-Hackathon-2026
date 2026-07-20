from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter

from app.core.terminal_logging import log_blob
from app.services.analysis import analysis_status
from app.services.llm import llm_health_snapshot
from app.services.parsers import ocr_health

router = APIRouter()
LOGGER = logging.getLogger(__name__)


@router.get("/health")
def health() -> dict[str, Any]:
    llm_health = llm_health_snapshot()
    result = {
        "status": "OK",
        "service": "Industrial Ops Brain API",
        "llm_provider": llm_health["active_provider"],
        "llm_model": llm_health["active_model"],
        "llm_configured": llm_health["provider_status"] == "configured",
        **llm_health,
        "ocr": ocr_health(),
        "analysis": analysis_status(),
    }
    log_blob(LOGGER, "endpoint.health.response", result)
    return result
