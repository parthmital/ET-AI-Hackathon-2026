from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, HTTPException

from app.core.terminal_logging import log_blob, log_event
from app.services.graph import (
    build_graph_export,
    build_graph_paths,
    build_graph_response,
)

LOGGER = logging.getLogger(__name__)
router = APIRouter()


@router.get("/graph")
def graph() -> dict[str, Any]:
    result = build_graph_response()
    log_blob(LOGGER, "endpoint.graph.response", result)
    return result


@router.get("/graph/paths")
def graph_paths(asset_id: str | None = None) -> list[dict[str, Any]]:
    result = build_graph_paths(asset_id)
    log_blob(LOGGER, "endpoint.graph_paths.response", result, asset_id=asset_id)
    return result


@router.get("/graph/export")
def graph_export(format: str = "json") -> dict[str, Any]:
    log_event(LOGGER, "endpoint.graph_export.start", format=format)
    try:
        result = build_graph_export(format)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    log_blob(LOGGER, "endpoint.graph_export.response", result, format=format)
    return result
