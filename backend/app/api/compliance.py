from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter

from app.api.errors import raise_llm_unavailable, raise_unprocessable
from app.core.terminal_logging import log_blob
from app.services.evidence_pack import compliance_evidence_pack
from app.services.intelligence import (
    check_compliance,
    compliance_gaps,
    contradictions,
)
from app.services.llm import LLMConfigurationError
from app.types import ComplianceRequest

LOGGER = logging.getLogger(__name__)
router = APIRouter()


@router.get("/compliance/gaps")
def gaps() -> list[dict[str, Any]]:
    result = compliance_gaps()
    log_blob(LOGGER, "endpoint.compliance_gaps.response", result, count=len(result))
    return result


@router.get("/contradictions")
def contradiction_list(asset_id: str | None = None) -> list[dict[str, Any]]:
    result = contradictions(asset_id)
    log_blob(
        LOGGER,
        "endpoint.contradictions.response",
        result,
        asset_id=asset_id,
        count=len(result),
    )
    return result


@router.get("/compliance/evidence-pack")
def compliance_pack() -> dict[str, Any]:
    result = compliance_evidence_pack()
    log_blob(LOGGER, "endpoint.compliance_evidence_pack.response", result)
    return result


@router.post("/compliance/check")
def compliance_check(request: ComplianceRequest) -> dict[str, Any]:
    log_blob(LOGGER, "endpoint.compliance_check.request", request.model_dump())
    try:
        result = check_compliance(request)
        log_blob(LOGGER, "endpoint.compliance_check.response", result)
        return result
    except ValueError as exc:
        LOGGER.warning("Compliance request rejected. error=%s", exc)
        raise_unprocessable(exc)
    except (LLMConfigurationError, RuntimeError) as exc:
        raise_llm_unavailable("Compliance request", exc)
