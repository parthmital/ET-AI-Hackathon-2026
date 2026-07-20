from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, HTTPException

from app.core.terminal_logging import log_blob, log_event
from app.services.evidence_pack import asset_evidence_pack
from app.services.intelligence import (
    asset_detail,
    asset_list,
    asset_risk_summary,
    asset_timeline,
)

LOGGER = logging.getLogger(__name__)
router = APIRouter()


@router.get("/assets")
def assets() -> list[dict[str, Any]]:
    result = asset_list()
    log_blob(LOGGER, "endpoint.assets.response", result, count=len(result))
    return result


@router.get("/assets/{asset_id}")
def asset(asset_id: str) -> dict[str, Any]:
    log_event(LOGGER, "endpoint.asset.start", asset_id=asset_id)
    result = asset_detail(asset_id)
    if not result:
        raise HTTPException(status_code=404, detail="Asset not found.")
    log_blob(LOGGER, "endpoint.asset.response", result)
    return result


@router.get("/assets/{asset_id}/timeline")
def timeline(asset_id: str) -> list[dict[str, Any]]:
    result = asset_timeline(asset_id)
    log_blob(LOGGER, "endpoint.asset_timeline.response", result, asset_id=asset_id)
    return result


@router.get("/assets/{asset_id}/risk-summary")
def risk_summary(asset_id: str) -> dict[str, Any]:
    log_event(LOGGER, "endpoint.asset_risk_summary.start", asset_id=asset_id)
    result = asset_risk_summary(asset_id)
    if not result:
        raise HTTPException(status_code=404, detail="Asset not found.")
    log_blob(LOGGER, "endpoint.asset_risk_summary.response", result)
    return result


@router.get("/assets/{asset_id}/evidence-pack")
def asset_pack(asset_id: str) -> dict[str, Any]:
    log_event(LOGGER, "endpoint.asset_evidence_pack.start", asset_id=asset_id)
    result = asset_evidence_pack(asset_id)
    if not result:
        raise HTTPException(status_code=404, detail="Asset not found.")
    log_blob(LOGGER, "endpoint.asset_evidence_pack.response", result)
    return result
