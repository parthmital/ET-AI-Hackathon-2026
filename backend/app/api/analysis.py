from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter

from app.core.terminal_logging import log_blob, log_event
from app.services.analysis import analysis_status, regenerate_analysis

router = APIRouter()
LOGGER = logging.getLogger(__name__)


@router.get("/analysis/status")
def get_analysis_status() -> dict[str, Any]:
    result = analysis_status()
    log_blob(LOGGER, "endpoint.analysis_status.response", result)
    return result


@router.post("/analysis/regenerate")
def regenerate_generated_analysis() -> dict[str, Any]:
    log_event(LOGGER, "endpoint.analysis_regenerate.start", source="manual")
    result = regenerate_analysis(source="manual", raise_on_error=False)
    log_blob(LOGGER, "endpoint.analysis_regenerate.response", result)
    return result
