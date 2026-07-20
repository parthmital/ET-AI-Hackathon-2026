from __future__ import annotations

from collections import Counter
import json
import logging
from typing import Any

from app.services.database import Database
from app.services.graph import build_graph_paths
from app.services.llm import get_llm_provider
from app.services.terminal_logging import log_blob, log_event
from app.services.vector_store import vector_store
from app.types import ChatRequest, ComplianceRequest, RCARequest

LOGGER = logging.getLogger(__name__)
MAX_SELECTED_CHUNKS = 6


def dashboard_summary() -> dict[str, Any]:
    log_event(LOGGER, "intelligence.dashboard.start")
    documents = Database.list_documents()
    assets = Database.list_assets()
    gaps = Database.rows(
        """
        SELECT *
        FROM compliance_gaps
        WHERE workspace_id = ?
        ORDER BY id DESC
        """,
        (Database.workspace_id(),),
    )
    entities = Database.list_entities()
    failure_modes = [
        entity["value"]
        for entity in entities
        if entity["entity_type"] == "Failure Mode"
    ]
    result = {
        "total_documents": len(documents),
        "total_assets": len(assets),
        "detected_compliance_gaps": len(gaps),
        "high_risk_assets": len(
            [asset for asset in assets if asset["risk_level"] == "High"]
        ),
        "recent_uploads": documents[:5],
        "top_failure_modes": [
            {"failure_mode": name, "count": count}
            for name, count in Counter(failure_modes).most_common(5)
        ],
    }
    log_blob(LOGGER, "intelligence.dashboard.finish", result)
    return result


def run_chat(request: ChatRequest) -> dict[str, Any]:
    log_blob(LOGGER, "intelligence.chat.start", request.model_dump())
    matches = vector_store.query(
        request.question, request.filters, limit=MAX_SELECTED_CHUNKS
    )
    log_blob(LOGGER, "intelligence.chat.matches", matches, match_count=len(matches))
    if not matches:
        raise ValueError(
            "No uploaded evidence matched this question. Upload relevant documents first."
        )
    related_entities = related_entities_from_matches(matches)
    log_blob(LOGGER, "intelligence.chat.related_entities", related_entities)
    citations = citations_from_matches(matches[:4])
    log_blob(LOGGER, "intelligence.chat.citations", citations)
    if not citations:
        raise ValueError("Retrieved evidence is missing citation metadata.")
    provider = get_llm_provider()
    answer = provider.answer(request.question, matches)
    result = {
        "answer": answer,
        "citations": citations,
        "confidence": round(min(0.94, max(match["score"] for match in matches)), 2),
        "related_entities": related_entities,
        "graph_paths": graph_paths_for_question(request.question, matches),
    }
    log_blob(LOGGER, "intelligence.chat.finish", result)
    return result


def related_entities_from_matches(matches: list[dict[str, Any]]) -> list[str]:
    log_blob(LOGGER, "intelligence.related_entities.start", matches)
    document_ids = {
        int(match["metadata"]["document_id"])
        for match in matches
        if "document_id" in match["metadata"]
    }
    if not document_ids:
        log_event(LOGGER, "intelligence.related_entities.no_document_ids")
        return []
    placeholders = ",".join("?" for _ in document_ids)
    rows = Database.rows(
        f"""
        SELECT DISTINCT value
        FROM entities
        WHERE workspace_id = ?
            AND document_id IN ({placeholders})
            AND entity_type IN ('Equipment', 'Failure Mode', 'Spare Part')
        ORDER BY value
        """,
        (Database.workspace_id(), *tuple(document_ids)),
    )
    result = [row["value"] for row in rows[:12]]
    log_blob(LOGGER, "intelligence.related_entities.finish", result)
    return result


def citations_from_matches(matches: list[dict[str, Any]]) -> list[dict[str, Any]]:
    log_blob(LOGGER, "intelligence.citations.start", matches)
    citations: list[dict[str, Any]] = []
    for match in matches:
        metadata = match.get("metadata", {})
        filename = metadata.get("filename")
        page = metadata.get("page")
        if not filename or page is None:
            continue
        citations.append(
            {
                "document": str(filename),
                "page": int(page),
                "snippet": snippet(str(match["text"])),
            }
        )
        log_blob(LOGGER, "intelligence.citations.added", citations[-1])
    log_blob(LOGGER, "intelligence.citations.finish", citations)
    return citations


def asset_list() -> list[dict[str, Any]]:
    result = Database.list_assets()
    log_blob(LOGGER, "intelligence.asset_list", result)
    return result


def asset_detail(asset_id: str) -> dict[str, Any] | None:
    log_event(LOGGER, "intelligence.asset_detail.start", asset_id=asset_id)
    asset = Database.get_asset(asset_id.upper())
    if not asset:
        log_event(LOGGER, "intelligence.asset_detail.not_found", asset_id=asset_id)
        return None
    asset["related_documents"] = Database.rows(
        """
        SELECT documents.id, documents.filename, documents.document_type
        FROM asset_documents
        JOIN documents ON documents.id = asset_documents.document_id
            AND documents.workspace_id = asset_documents.workspace_id
        WHERE asset_documents.workspace_id = ? AND asset_documents.asset_id = ?
        ORDER BY documents.filename
        """,
        (Database.workspace_id(), asset["id"]),
    )
    asset["timeline"] = asset_timeline(asset["id"])
    asset["risk_summary"] = asset_risk_summary(asset["id"])
    log_blob(LOGGER, "intelligence.asset_detail.finish", asset)
    return asset


def asset_timeline(asset_id: str) -> list[dict[str, Any]]:
    result = Database.rows(
        """
        SELECT * FROM timeline_events
        WHERE workspace_id = ? AND asset_id = ?
        ORDER BY event_date DESC, id DESC
        """,
        (Database.workspace_id(), asset_id.upper()),
    )
    log_blob(LOGGER, "intelligence.asset_timeline", result, asset_id=asset_id)
    return result


def asset_risk_summary(asset_id: str) -> dict[str, Any] | None:
    log_event(LOGGER, "intelligence.asset_risk_summary.start", asset_id=asset_id)
    asset = Database.get_asset(asset_id.upper())
    if not asset:
        log_event(
            LOGGER, "intelligence.asset_risk_summary.not_found", asset_id=asset_id
        )
        return None
    gaps = Database.rows(
        """
        SELECT *
        FROM compliance_gaps
        WHERE workspace_id = ? AND asset_id = ?
        ORDER BY id DESC
        """,
        (Database.workspace_id(), asset["id"]),
    )
    gaps = [with_gap_evidence_status(gap) for gap in gaps]
    events = asset_timeline(asset["id"])
    failure_patterns = sorted(
        {
            entity["value"]
            for entity in Database.list_entities()
            if entity["entity_type"] == "Failure Mode"
            and asset["id"] in entity["context"]
        }
    )
    result = {
        "asset_id": asset["id"],
        "risk_level": asset["risk_level"],
        "last_inspection": asset.get("last_inspection"),
        "source_document": asset.get("source_document", ""),
        "source_page": asset.get("source_page", 1),
        "evidence_text": asset.get("evidence_text", ""),
        "open_compliance_gaps": gaps,
        "failure_patterns": failure_patterns,
        "maintenance_history": events,
        "suggested_next_actions": asset.get("suggested_actions", []),
        "suggested_action_evidence": [
            {
                "action": action,
                "evidence": [
                    {
                        "document": asset.get("source_document", ""),
                        "page": asset.get("source_page", 1),
                        "snippet": asset.get("evidence_text", ""),
                    }
                ],
            }
            for action in asset.get("suggested_actions", [])
        ],
        "graph_paths": build_graph_paths(asset["id"]),
        "contradictions": Database.list_contradictions(asset["id"]),
    }
    log_blob(LOGGER, "intelligence.asset_risk_summary.finish", result)
    return result


def run_rca(request: RCARequest) -> dict[str, Any]:
    log_blob(LOGGER, "intelligence.rca.start", request.model_dump())
    asset_id = request.asset.upper()
    query = f"Root cause analysis for {asset_id}: {request.symptom}"
    matches = vector_store.query(query, {}, limit=MAX_SELECTED_CHUNKS)
    log_blob(LOGGER, "intelligence.rca.matches", matches, match_count=len(matches))
    if not matches:
        raise ValueError(
            "No uploaded evidence matched this RCA request. Upload relevant documents first."
        )
    citations = citations_from_matches(matches[:4])
    log_blob(LOGGER, "intelligence.rca.citations", citations)
    if not citations:
        raise ValueError("Retrieved evidence is missing citation metadata.")
    context_text = "\n\n".join(
        (
            f"{match['metadata']['filename']} page {match['metadata']['page']}:\n"
            f"{match['text']}"
        )
        for match in matches
    )
    log_blob(LOGGER, "intelligence.rca.context_text", context_text)
    provider = get_llm_provider()
    payload = provider.complete_json(
        (
            "Generate an industrial root cause analysis only from provided evidence. "
            "Return a single JSON object with arrays named likely_causes, recommended_checks, and preventive_actions. "
            "Use short, evidence-backed plain text strings with proper sentence casing. "
            "Preserve asset IDs, acronyms, filenames, and quoted evidence exactly. Do not invent facts."
        ),
        (
            f"Asset: {asset_id}\n"
            f"Symptom: {request.symptom}\n\n"
            f"Evidence:\n{context_text}"
        ),
    )
    log_blob(LOGGER, "intelligence.rca.llm_payload", payload)
    result = {
        "asset": asset_id,
        "symptom": request.symptom,
        "likely_causes": string_list(payload.get("likely_causes"), "likely_causes"),
        "supporting_evidence": citations,
        "recommended_checks": string_list(
            payload.get("recommended_checks"), "recommended_checks"
        ),
        "preventive_actions": string_list(
            payload.get("preventive_actions"), "preventive_actions"
        ),
        "cited_documents": sorted({citation["document"] for citation in citations}),
        "graph_paths": build_graph_paths(asset_id),
        "contradictions": Database.list_contradictions(asset_id),
    }
    result["likely_cause_evidence"] = evidence_backed_items(
        result["likely_causes"], citations
    )
    result["recommended_check_evidence"] = evidence_backed_items(
        result["recommended_checks"], citations
    )
    result["preventive_action_evidence"] = evidence_backed_items(
        result["preventive_actions"], citations
    )
    log_blob(LOGGER, "intelligence.rca.finish", result)
    return result


def compliance_gaps() -> list[dict[str, Any]]:
    rows = Database.rows(
        """
        SELECT *
        FROM compliance_gaps
        WHERE workspace_id = ?
        ORDER BY
            CASE severity
                WHEN 'High' THEN 1
                WHEN 'Medium' THEN 2
                WHEN 'Low' THEN 3
                ELSE 4
            END,
            id DESC
        """,
        (Database.workspace_id(),),
    )
    result = [with_gap_evidence_status(gap) for gap in rows]
    log_blob(LOGGER, "intelligence.compliance_gaps", result)
    return result


def contradictions(asset_id: str | None = None) -> list[dict[str, Any]]:
    result = Database.list_contradictions(asset_id)
    log_blob(LOGGER, "intelligence.contradictions", result, asset_id=asset_id)
    return result


def check_compliance(request: ComplianceRequest) -> dict[str, Any]:
    log_blob(LOGGER, "intelligence.compliance_check.start", request.model_dump())
    gaps = compliance_gaps()
    if not gaps:
        raise ValueError(
            "No generated compliance gaps are stored. Upload documents and analyse the workspace first."
        )
    summary = get_llm_provider().complete_text(
        (
            "Summarise compliance findings only from the provided generated gaps and evidence. "
            "Use Indian English, plain text, ASCII punctuation, and no markdown. "
            "Use proper sentence casing and preserve asset IDs, acronyms, filenames, and quoted evidence exactly. "
            "Keep the summary under 120 words."
        ),
        (
            f"Request: {request.query}\n\n"
            f"Generated compliance gaps:\n{json.dumps(gaps, ensure_ascii=True)}"
        ),
    )
    result = {
        "summary": summary,
        "gaps": gaps,
    }
    log_blob(LOGGER, "intelligence.compliance_check.finish", result)
    return result


def string_list(value: Any, field_name: str) -> list[str]:
    log_event(
        LOGGER, "intelligence.string_list.start", field_name=field_name, value=value
    )
    if not isinstance(value, list):
        raise RuntimeError(f"LLM RCA response must include {field_name} as an array.")
    cleaned = [" ".join(str(item).split()) for item in value if str(item).strip()]
    if not cleaned:
        raise RuntimeError(f"LLM RCA response returned no {field_name}.")
    log_blob(LOGGER, "intelligence.string_list.finish", cleaned, field_name=field_name)
    return cleaned


def with_gap_evidence_status(gap: dict[str, Any]) -> dict[str, Any]:
    gap = dict(gap)
    if gap.get("source_document") and gap.get("evidence"):
        gap["evidence_status"] = "accepted"
        gap["confidence"] = 0.9
    else:
        gap["evidence_status"] = "rejected"
        gap["confidence"] = 0.0
    return gap


def evidence_backed_items(
    items: list[str], citations: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    return [{"text": item, "evidence": citations[:2]} for item in items]


def snippet(text: str, length: int = 280) -> str:
    cleaned = " ".join(text.split())
    if len(cleaned) <= length:
        result = cleaned
    else:
        result = f"{cleaned[:length].rstrip()}..."
    log_event(LOGGER, "intelligence.snippet", text=text, length=length, result=result)
    return result


def graph_paths_for_question(
    question: str, matches: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    log_blob(
        LOGGER,
        "intelligence.graph_paths_for_question.start",
        {"question": question, "matches": matches},
    )
    known_asset_ids = [asset["id"] for asset in Database.list_assets()]
    asset_ids = {
        asset_id for asset_id in known_asset_ids if asset_id.lower() in question.lower()
    }
    for match in matches:
        haystack = (
            f"{match.get('text', '')} {match.get('metadata', {}).get('filename', '')}"
        ).lower()
        asset_ids.update(
            asset_id for asset_id in known_asset_ids if asset_id.lower() in haystack
        )
    paths: list[dict[str, Any]] = []
    for asset_id in sorted(asset_ids)[:3]:
        paths.extend(build_graph_paths(asset_id))
    result = paths[:3]
    log_blob(LOGGER, "intelligence.graph_paths_for_question.finish", result)
    return result
