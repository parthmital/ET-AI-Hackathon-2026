from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, HTTPException

from app.core.terminal_logging import log_blob, log_event
from app.services.ingestion import clear_workspace

LOGGER = logging.getLogger(__name__)
router = APIRouter()


@router.delete("/workspace")
def delete_workspace() -> dict[str, Any]:
    log_event(LOGGER, "endpoint.workspace.clear.start")
    try:
        result = clear_workspace()
        log_blob(LOGGER, "endpoint.workspace.clear.response", result)
        return result
    except Exception as exc:
        LOGGER.exception("Workspace clearing failed.")
        raise HTTPException(
            status_code=500, detail="Workspace could not be cleared."
        ) from exc
