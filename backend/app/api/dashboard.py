from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter

from app.core.terminal_logging import log_blob
from app.services.intelligence import dashboard_summary

router = APIRouter()
LOGGER = logging.getLogger(__name__)


@router.get("/dashboard")
def dashboard() -> dict[str, Any]:
    result = dashboard_summary()
    log_blob(LOGGER, "endpoint.dashboard.response", result)
    return result
