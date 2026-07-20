from __future__ import annotations

from datetime import datetime
import logging
from pathlib import Path
import re
import time
from typing import Any

from app.services.database import Database
from app.services.llm import (
    LLMConfigurationError,
    LLMProviderError,
    get_llm_provider,
    public_llm_error_message,
)
from app.services.terminal_logging import log_blob, log_event
from app.settings import Settings

ALLOWED_RISK_LEVELS = {"High", "Medium", "Low", "Unknown"}
ALLOWED_SEVERITIES = {"High", "Medium", "Low"}
ALLOWED_STATUSES = {"Open", "Closed", "In Progress", "Monitoring"}
ALLOWED_CONTRADICTION_TYPES = {
    "Compliance Conflict",
    "Maintenance Conflict",
    "Operational Conflict",
    "Risk Conflict",
    "Sensor Conflict",
    "Unknown",
}
ALLOWED_ENTITY_TYPES = {
    "Equipment",
    "Failure Mode",
    "Maintenance Activity",
    "Safety Hazard",
    "PPE Requirement",
    "Regulation",
    "Work Order",
    "Spare Part",
    "Historian Signal",
    "Permit Control",
    "Audit Status",
    "Location",
    "Inspection Date",
    "Document Date",
    "Person",
    "Process Parameter",
}
LOGGER = logging.getLogger(__name__)
ANALYSIS_ARRAY_KEYS = (
    "entities",
    "assets",
    "timeline_events",
    "compliance_gaps",
    "contradictions",
)
IDENTIFIER_PATTERN = re.compile(
    r"\b[A-Z]{1,8}-\d+[A-Z0-9-]*\b"
    r"|\b\d{4}-\d{2}-\d{2}\b"
    r"|\b\d+(?:\.\d+)?\s*(?:MM/S|DAYS?|DAY)\b",
    re.IGNORECASE,
)
TOKEN_PATTERN = re.compile(r"[a-z0-9]+(?:[-./][a-z0-9]+)*")
EVIDENCE_STOP_WORDS = {
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "before",
    "but",
    "by",
    "due",
    "for",
    "from",
    "has",
    "in",
    "is",
    "it",
    "not",
    "of",
    "on",
    "or",
    "the",
    "to",
    "under",
    "was",
    "with",
}

ANALYSIS_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "entities": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "entity_type": {
                        "type": "string",
                        "enum": sorted(ALLOWED_ENTITY_TYPES),
                    },
                    "value": {"type": "string"},
                    "confidence": {"type": "number"},
                    "context": {"type": "string"},
                    "source_document": {"type": "string"},
                    "source_page": {"type": "integer"},
                },
                "required": [
                    "entity_type",
                    "value",
                    "confidence",
                    "context",
                    "source_document",
                    "source_page",
                ],
            },
        },
        "assets": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "string"},
                    "name": {"type": "string"},
                    "asset_type": {"type": "string"},
                    "location": {"type": "string"},
                    "risk_level": {
                        "type": "string",
                        "enum": sorted(ALLOWED_RISK_LEVELS),
                    },
                    "last_inspection": {"type": ["string", "null"]},
                    "suggested_actions": {"type": "array", "items": {"type": "string"}},
                    "source_document": {"type": "string"},
                    "source_page": {"type": "integer"},
                },
                "required": [
                    "id",
                    "name",
                    "asset_type",
                    "location",
                    "risk_level",
                    "last_inspection",
                    "suggested_actions",
                    "source_document",
                    "source_page",
                ],
            },
        },
        "timeline_events": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "asset_id": {"type": "string"},
                    "event_date": {"type": "string"},
                    "event_type": {"type": "string"},
                    "title": {"type": "string"},
                    "description": {"type": "string"},
                    "source_document": {"type": "string"},
                    "source_page": {"type": "integer"},
                },
                "required": [
                    "asset_id",
                    "event_date",
                    "event_type",
                    "title",
                    "description",
                    "source_document",
                    "source_page",
                ],
            },
        },
        "compliance_gaps": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "asset_id": {"type": "string"},
                    "severity": {"type": "string", "enum": sorted(ALLOWED_SEVERITIES)},
                    "gap_type": {"type": "string"},
                    "description": {"type": "string"},
                    "evidence": {"type": "string"},
                    "corrective_action": {"type": "string"},
                    "status": {"type": "string", "enum": sorted(ALLOWED_STATUSES)},
                    "source_document": {"type": "string"},
                    "source_page": {"type": "integer"},
                },
                "required": [
                    "asset_id",
                    "severity",
                    "gap_type",
                    "description",
                    "evidence",
                    "corrective_action",
                    "status",
                    "source_document",
                    "source_page",
                ],
            },
        },
        "contradictions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "asset_id": {"type": "string"},
                    "severity": {"type": "string", "enum": sorted(ALLOWED_SEVERITIES)},
                    "contradiction_type": {
                        "type": "string",
                        "enum": sorted(ALLOWED_CONTRADICTION_TYPES),
                    },
                    "description": {"type": "string"},
                    "evidence_a": {"type": "string"},
                    "source_document_a": {"type": "string"},
                    "source_page_a": {"type": "integer"},
                    "evidence_b": {"type": "string"},
                    "source_document_b": {"type": "string"},
                    "source_page_b": {"type": "integer"},
                    "status": {"type": "string", "enum": sorted(ALLOWED_STATUSES)},
                },
                "required": [
                    "asset_id",
                    "severity",
                    "contradiction_type",
                    "description",
                    "evidence_a",
                    "source_document_a",
                    "source_page_a",
                    "evidence_b",
                    "source_document_b",
                    "source_page_b",
                    "status",
                ],
            },
        },
    },
    "required": [
        "entities",
        "assets",
        "timeline_events",
        "compliance_gaps",
        "contradictions",
    ],
}


def analysis_status() -> dict[str, Any]:
    result = Database.latest_analysis_status()
    log_blob(LOGGER, "analysis.status", result)
    return result


def regenerate_analysis(
    source: str = "manual", raise_on_error: bool = False
) -> dict[str, Any]:
    started_at = time.perf_counter()
    log_event(
        LOGGER,
        "analysis.regenerate.start",
        source=source,
        raise_on_error=raise_on_error,
    )
    run_id = Database.start_analysis_run(source)
    log_event(LOGGER, "analysis.regenerate.run_created", run_id=run_id, source=source)
    try:
        result = generate_structured_analysis()
        log_blob(LOGGER, "analysis.regenerate.generated_result", result, run_id=run_id)
        persist_generated_analysis(result)
        counts = {
            "assets": len(result["assets"]),
            "timeline_events": len(result["timeline_events"]),
            "compliance_gaps": len(result["compliance_gaps"]),
            "contradictions": len(result["contradictions"]),
        }
        status = Database.finish_analysis_run(run_id, "complete", "", **counts)
        log_blob(
            LOGGER,
            "analysis.regenerate.complete",
            status,
            run_id=run_id,
            elapsed_seconds=round(time.perf_counter() - started_at, 3),
        )
        return status
    except Exception as exc:
        public_message = public_llm_error_message(exc)
        if isinstance(exc, LLMProviderError):
            LOGGER.error(
                "Generated analysis diagnostics. source=%s run_id=%s diagnostics=%s",
                source,
                run_id,
                exc.diagnostics,
            )
        LOGGER.exception(
            "Generated analysis failed. source=%s run_id=%s public_message=%s",
            source,
            run_id,
            public_message,
        )
        status = Database.finish_analysis_run(run_id, "failed", public_message)
        log_blob(
            LOGGER,
            "analysis.regenerate.failed",
            status,
            level=logging.ERROR,
            run_id=run_id,
            source=source,
            public_message=public_message,
            error_type=type(exc).__name__,
            error=str(exc),
            elapsed_seconds=round(time.perf_counter() - started_at, 3),
        )
        if raise_on_error:
            raise
        return status


def generate_structured_analysis() -> dict[str, list[dict[str, Any]]]:
    started_at = time.perf_counter()
    log_event(LOGGER, "analysis.generate.start")
    documents = Database.rows(
        """
        SELECT id, filename, page_count
        FROM documents
        WHERE workspace_id = ?
        ORDER BY filename, id
        """,
        (Database.workspace_id(),),
    )
    log_blob(LOGGER, "analysis.generate.documents", documents, count=len(documents))
    if not documents:
        result = {
            "entities": [],
            "assets": [],
            "timeline_events": [],
            "compliance_gaps": [],
            "contradictions": [],
        }
        log_blob(LOGGER, "analysis.generate.no_documents", result)
        return result

    chunks = Database.list_chunks()
    log_blob(LOGGER, "analysis.generate.chunks", chunks, chunk_count=len(chunks))
    source_pages = build_source_pages(chunks)
    log_blob(
        LOGGER,
        "analysis.generate.source_pages",
        {
            f"{filename}#page-{page}": text
            for (filename, page), text in source_pages.items()
        },
        source_page_count=len(source_pages),
    )
    batches = build_evidence_batches(chunks)
    log_blob(
        LOGGER,
        "analysis.generate.evidence_batches",
        batches,
        batch_count=len(batches),
        analysis_batch_characters=Settings.analysis_batch_characters(),
    )
    combined = {
        "entities": [],
        "assets": [],
        "timeline_events": [],
        "compliance_gaps": [],
        "contradictions": [],
    }
    system_prompt = (
        "Extract industrial operations records only from the supplied uploaded evidence. "
        "Return one top-level JSON object with arrays named entities, assets, timeline_events, compliance_gaps, and contradictions. "
        "Do not use outside knowledge or infer identifiers, dates, locations, risks, gaps, or actions that the evidence does not support. "
        "Use contradictions only for conflicts between two cited evidence statements, including conflicting maintenance status, risk statements, sensor readings, P&ID tags, or compliance state. "
        "Copy entity context, event descriptions, and compliance evidence verbatim from one cited source page. "
        "Copy contradiction evidence_a and evidence_b verbatim from their cited source pages. "
        "Use the exact Source filename and Page number shown in the input. "
        "Use proper title casing for short labels and proper sentence casing for descriptions and actions. "
        "Preserve asset IDs, acronyms, filenames, and quoted evidence exactly. "
        "Return empty arrays when a record type is not supported. Return only the requested JSON object."
    )
    log_blob(LOGGER, "analysis.generate.system_prompt", system_prompt)
    provider = get_llm_provider()
    for index, evidence in enumerate(batches, start=1):
        log_blob(
            LOGGER,
            "analysis.generate.batch.evidence",
            evidence,
            batch_index=index,
            batch_count=len(batches),
            character_count=len(evidence),
        )
        payload = provider.complete_json(
            system_prompt,
            evidence,
            schema=ANALYSIS_SCHEMA,
        )
        log_blob(
            LOGGER,
            "analysis.generate.batch.llm_payload",
            payload,
            batch_index=index,
            batch_count=len(batches),
        )
        normalised = normalise_analysis_payload(payload)
        log_blob(
            LOGGER,
            "analysis.generate.batch.normalised_payload",
            normalised,
            batch_index=index,
            batch_count=len(batches),
        )
        validated = validate_batch(normalised, source_pages)
        log_blob(
            LOGGER,
            "analysis.generate.batch.validated",
            validated,
            batch_index=index,
            batch_count=len(batches),
            entities=len(validated["entities"]),
            assets=len(validated["assets"]),
            timeline_events=len(validated["timeline_events"]),
            compliance_gaps=len(validated["compliance_gaps"]),
            contradictions=len(validated["contradictions"]),
        )
        for key in combined:
            combined[key].extend(validated[key])
        log_event(
            LOGGER,
            "analysis.generate.batch.combined_counts",
            batch_index=index,
            entities=len(combined["entities"]),
            assets=len(combined["assets"]),
            timeline_events=len(combined["timeline_events"]),
            compliance_gaps=len(combined["compliance_gaps"]),
            contradictions=len(combined["contradictions"]),
        )

    merged = merge_analysis(combined)
    log_blob(
        LOGGER,
        "analysis.generate.finish",
        merged,
        elapsed_seconds=round(time.perf_counter() - started_at, 3),
    )
    return merged


def normalise_analysis_payload(payload: dict[str, Any]) -> dict[str, Any]:
    log_blob(LOGGER, "analysis.normalise_payload.start", payload)
    candidate = payload
    if not any(key in candidate for key in ANALYSIS_ARRAY_KEYS):
        for wrapper_key in ("analysis", "result", "data", "output"):
            nested = candidate.get(wrapper_key)
            if isinstance(nested, dict) and any(
                key in nested for key in ANALYSIS_ARRAY_KEYS
            ):
                log_event(
                    LOGGER,
                    "analysis.normalise_payload.unwrap",
                    wrapper_key=wrapper_key,
                )
                candidate = nested
                break

    present_keys = [key for key in ANALYSIS_ARRAY_KEYS if key in candidate]
    if not present_keys:
        raise RuntimeError(
            "Generated analysis must include at least one recognised analysis array."
        )

    missing_keys = [key for key in ANALYSIS_ARRAY_KEYS if key not in candidate]
    if missing_keys:
        LOGGER.warning(
            "Generated analysis omitted arrays; treating them as empty. missing=%s present=%s",
            missing_keys,
            present_keys,
        )
    result = {key: candidate.get(key, []) for key in ANALYSIS_ARRAY_KEYS}
    log_blob(LOGGER, "analysis.normalise_payload.finish", result)
    return result


def build_source_pages(chunks: list[dict[str, Any]]) -> dict[tuple[str, int], str]:
    log_blob(LOGGER, "analysis.source_pages.start", chunks, chunk_count=len(chunks))
    pages: dict[tuple[str, int], list[str]] = {}
    for chunk in chunks:
        key = (str(chunk["filename"]), int(chunk["page"]))
        text = clean_text(chunk["text"])
        if text and text not in pages.setdefault(key, []):
            pages[key].append(text)
            log_blob(
                LOGGER,
                "analysis.source_pages.add_chunk",
                text,
                filename=key[0],
                page=key[1],
                chunk_id=chunk.get("id"),
                chunk_index=chunk.get("chunk_index"),
            )
    result = {key: " ".join(parts) for key, parts in pages.items()}
    log_blob(
        LOGGER,
        "analysis.source_pages.finish",
        {f"{key[0]}#page-{key[1]}": value for key, value in result.items()},
        source_page_count=len(result),
    )
    return result


def build_evidence_batches(chunks: list[dict[str, Any]]) -> list[str]:
    limit = Settings.analysis_batch_characters()
    log_event(
        LOGGER, "analysis.evidence_batches.start", chunk_count=len(chunks), limit=limit
    )
    batches: list[str] = []
    blocks: list[str] = []
    length = 0
    for chunk in chunks:
        block = (
            f"Source: {chunk['filename']}\n"
            f"Page: {chunk['page']}\n"
            f"Text:\n{chunk['text']}"
        )
        if blocks and length + len(block) > limit:
            batch = "\n\n".join(blocks)
            batches.append(batch)
            log_blob(
                LOGGER,
                "analysis.evidence_batches.created",
                batch,
                batch_index=len(batches),
                character_count=len(batch),
            )
            blocks = []
            length = 0
        blocks.append(block)
        length += len(block)
    if blocks:
        batch = "\n\n".join(blocks)
        batches.append(batch)
        log_blob(
            LOGGER,
            "analysis.evidence_batches.created",
            batch,
            batch_index=len(batches),
            character_count=len(batch),
        )
    log_event(LOGGER, "analysis.evidence_batches.finish", batch_count=len(batches))
    return batches


def validate_batch(
    payload: dict[str, Any], source_pages: dict[tuple[str, int], str]
) -> dict[str, list[dict[str, Any]]]:
    log_blob(
        LOGGER,
        "analysis.validate_batch.start",
        payload,
        source_page_count=len(source_pages),
    )
    entities = validate_entities(payload.get("entities"), source_pages)
    assets = validate_assets(payload.get("assets"), source_pages)
    timelines = validate_timeline_events(payload.get("timeline_events"), source_pages)
    gaps = validate_compliance_gaps(payload.get("compliance_gaps"), source_pages)
    contradictions = validate_contradictions(
        payload.get("contradictions"), source_pages
    )
    result = {
        "entities": entities,
        "assets": assets,
        "timeline_events": timelines,
        "compliance_gaps": gaps,
        "contradictions": contradictions,
    }
    log_blob(
        LOGGER,
        "analysis.validate_batch.finish",
        result,
        entities=len(entities),
        assets=len(assets),
        timeline_events=len(timelines),
        compliance_gaps=len(gaps),
        contradictions=len(contradictions),
    )
    return result


def validate_entities(
    value: Any, source_pages: dict[tuple[str, int], str]
) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        raise RuntimeError("Generated analysis must include an entities array.")
    result: list[dict[str, Any]] = []
    for item in value:
        if not isinstance(item, dict):
            log_blob(LOGGER, "analysis.validate_entity.reject", item, reason="not_dict")
            continue
        source = source_reference(item, source_pages)
        raw_entity_type = clean_text(item.get("entity_type")) or clean_text(
            item.get("type")
        )
        entity_value = clean_text(
            item.get("value") or item.get("id") or item.get("name")
        )
        entity_type = raw_entity_type
        if raw_entity_type not in ALLOWED_ENTITY_TYPES and normalise_asset_id(
            entity_value
        ):
            entity_type = "Equipment"
        context = clean_text(item.get("context") or item.get("evidence"))
        if not source:
            log_blob(
                LOGGER,
                "analysis.validate_entity.reject",
                item,
                reason="source_reference_not_found",
            )
            continue
        if entity_type not in ALLOWED_ENTITY_TYPES:
            log_blob(
                LOGGER,
                "analysis.validate_entity.reject",
                item,
                reason="unsupported_entity_type",
                entity_type=entity_type,
            )
            continue
        if not entity_value:
            log_blob(
                LOGGER, "analysis.validate_entity.reject", item, reason="empty_value"
            )
            continue
        if not context:
            context = source_excerpt(entity_value, source[2])
        if not context:
            log_blob(
                LOGGER, "analysis.validate_entity.reject", item, reason="empty_context"
            )
            continue
        if not evidence_supported(entity_value, source[2]):
            log_blob(
                LOGGER,
                "analysis.validate_entity.reject",
                item,
                reason="entity_value_not_in_source_text",
                source_document=source[0],
                source_page=source[1],
            )
            continue
        if not evidence_supported(context, source[2]):
            log_blob(
                LOGGER,
                "analysis.validate_entity.reject",
                item,
                reason="context_not_in_source_text",
                source_document=source[0],
                source_page=source[1],
            )
            continue
        try:
            confidence = min(1.0, max(0.0, float(item.get("confidence", 0))))
        except (TypeError, ValueError):
            confidence = 0.0
        record = {
            "document_id": source[3],
            "page": source[1],
            "entity_type": entity_type,
            "value": normalise_entity_value(entity_type, entity_value),
            "confidence": confidence,
            "context": context,
            "source_document": source[0],
        }
        log_blob(LOGGER, "analysis.validate_entity.accept", record)
        result.append(record)
    return result


def validate_assets(
    value: Any, source_pages: dict[tuple[str, int], str]
) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        raise RuntimeError("Generated analysis must include an assets array.")
    result: list[dict[str, Any]] = []
    for item in value:
        if not isinstance(item, dict):
            log_blob(LOGGER, "analysis.validate_asset.reject", item, reason="not_dict")
            continue
        source = source_reference(item, source_pages)
        asset_id = normalise_asset_id(item.get("id"))
        if not source:
            log_blob(
                LOGGER,
                "analysis.validate_asset.reject",
                item,
                reason="source_reference_not_found",
            )
            continue
        if not asset_id:
            log_blob(
                LOGGER,
                "analysis.validate_asset.reject",
                item,
                reason="invalid_asset_id",
            )
            continue
        if not evidence_supported(asset_id, source[2]):
            log_blob(
                LOGGER,
                "analysis.validate_asset.reject",
                item,
                reason="asset_id_not_in_source_text",
                source_document=source[0],
                source_page=source[1],
            )
            continue
        name = clean_text(item.get("name"))
        asset_type = clean_text(item.get("asset_type")) or clean_text(item.get("type"))
        asset_label = name or asset_type or asset_id
        asset_name = (
            asset_label
            if asset_id in asset_label or asset_label == asset_id
            else f"{asset_id} {asset_label}"
        )
        record = {
            "id": asset_id,
            "name": asset_name,
            "asset_type": asset_type or name or "Unknown",
            "location": clean_text(item.get("location")) or "Unknown",
            "risk_level": normalise_choice(item.get("risk_level"), ALLOWED_RISK_LEVELS)
            or "Unknown",
            "last_inspection": normalise_date_or_none(item.get("last_inspection")),
            "open_compliance_gaps": 0,
            "suggested_actions": clean_string_list(item.get("suggested_actions")),
            "source_document": source[0],
            "source_page": source[1],
            "evidence_text": source_excerpt(asset_id, source[2]),
            "_source_documents": {source[0]},
        }
        log_blob(LOGGER, "analysis.validate_asset.accept", record)
        result.append(record)
    return result


def validate_timeline_events(
    value: Any,
    source_pages: dict[tuple[str, int], str],
) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        raise RuntimeError("Generated analysis must include a timeline_events array.")
    result: list[dict[str, Any]] = []
    for item in value:
        if not isinstance(item, dict):
            log_blob(
                LOGGER, "analysis.validate_timeline.reject", item, reason="not_dict"
            )
            continue
        source = source_reference(item, source_pages)
        asset_id = normalise_asset_id(item.get("asset_id"))
        description = clean_text(item.get("description") or item.get("event"))
        event_date = normalise_date_or_none(item.get("event_date") or item.get("date"))
        title = clean_text(item.get("title")) or title_from_description(description)
        if not source:
            log_blob(
                LOGGER,
                "analysis.validate_timeline.reject",
                item,
                reason="source_reference_not_found",
            )
            continue
        if not asset_id:
            log_blob(
                LOGGER,
                "analysis.validate_timeline.reject",
                item,
                reason="invalid_asset_id",
            )
            continue
        if not event_date:
            log_blob(
                LOGGER,
                "analysis.validate_timeline.reject",
                item,
                reason="invalid_event_date",
            )
            continue
        if not title:
            log_blob(
                LOGGER, "analysis.validate_timeline.reject", item, reason="empty_title"
            )
            continue
        if not description:
            log_blob(
                LOGGER,
                "analysis.validate_timeline.reject",
                item,
                reason="empty_description",
            )
            continue
        if not evidence_supported(description, source[2]):
            log_blob(
                LOGGER,
                "analysis.validate_timeline.reject",
                item,
                reason="description_not_in_source_text",
                source_document=source[0],
                source_page=source[1],
            )
            continue
        if not evidence_supported(asset_id, source[2]):
            log_blob(
                LOGGER,
                "analysis.validate_timeline.reject",
                item,
                reason="asset_id_not_in_source_text",
                source_document=source[0],
                source_page=source[1],
            )
            continue
        record = {
            "asset_id": asset_id,
            "event_date": event_date,
            "event_type": clean_text(item.get("event_type"))
            or clean_text(item.get("type"))
            or "Other",
            "title": title,
            "description": description,
            "source_document": source[0],
            "source_page": source[1],
        }
        log_blob(LOGGER, "analysis.validate_timeline.accept", record)
        result.append(record)
    return result


def validate_compliance_gaps(
    value: Any,
    source_pages: dict[tuple[str, int], str],
) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        raise RuntimeError("Generated analysis must include a compliance_gaps array.")
    result: list[dict[str, Any]] = []
    for item in value:
        if not isinstance(item, dict):
            log_blob(LOGGER, "analysis.validate_gap.reject", item, reason="not_dict")
            continue
        source = source_reference(item, source_pages)
        asset_id = normalise_asset_id(item.get("asset_id"))
        description = clean_text(
            item.get("description") or item.get("gap_description") or item.get("gap")
        )
        evidence = clean_text(item.get("evidence")) or description
        severity = normalise_choice(item.get("severity"), ALLOWED_SEVERITIES)
        gap_type = clean_text(
            item.get("gap_type") or item.get("gap")
        ) or title_from_description(description)
        corrective_action = clean_text(item.get("corrective_action")) or (
            "Investigate and close the cited compliance gap."
        )
        description = description or evidence
        if not source:
            log_blob(
                LOGGER,
                "analysis.validate_gap.reject",
                item,
                reason="source_reference_not_found",
            )
            continue
        if not asset_id:
            log_blob(
                LOGGER, "analysis.validate_gap.reject", item, reason="invalid_asset_id"
            )
            continue
        severity = severity or "Medium"
        if not gap_type:
            log_blob(
                LOGGER, "analysis.validate_gap.reject", item, reason="empty_gap_type"
            )
            continue
        if not description:
            log_blob(
                LOGGER, "analysis.validate_gap.reject", item, reason="empty_description"
            )
            continue
        if not evidence:
            log_blob(
                LOGGER, "analysis.validate_gap.reject", item, reason="empty_evidence"
            )
            continue
        if not corrective_action:
            log_blob(
                LOGGER,
                "analysis.validate_gap.reject",
                item,
                reason="empty_corrective_action",
            )
            continue
        if not evidence_supported(evidence, source[2]):
            log_blob(
                LOGGER,
                "analysis.validate_gap.reject",
                item,
                reason="evidence_not_in_source_text",
                source_document=source[0],
                source_page=source[1],
            )
            continue
        if not evidence_supported(asset_id, source[2]):
            log_blob(
                LOGGER,
                "analysis.validate_gap.reject",
                item,
                reason="asset_id_not_in_source_text",
                source_document=source[0],
                source_page=source[1],
            )
            continue
        record = {
            "asset_id": asset_id,
            "severity": severity,
            "gap_type": gap_type,
            "description": description,
            "evidence": evidence,
            "corrective_action": corrective_action,
            "status": normalise_choice(item.get("status"), ALLOWED_STATUSES) or "Open",
            "source_document": source[0],
            "source_page": source[1],
        }
        log_blob(LOGGER, "analysis.validate_gap.accept", record)
        result.append(record)
    return result


def validate_contradictions(
    value: Any,
    source_pages: dict[tuple[str, int], str],
) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        raise RuntimeError("Generated analysis must include a contradictions array.")
    result: list[dict[str, Any]] = []
    for item in value:
        if not isinstance(item, dict):
            log_blob(
                LOGGER,
                "analysis.validate_contradiction.reject",
                item,
                reason="not_dict",
            )
            continue
        evidence_a_item, evidence_b_item = contradiction_evidence_items(item)
        source_a = source_reference(evidence_a_item, source_pages)
        source_b = source_reference(evidence_b_item, source_pages)
        asset_id = normalise_asset_id(item.get("asset_id"))
        evidence_a = clean_text(evidence_a_item.get("evidence"))
        evidence_b = clean_text(evidence_b_item.get("evidence"))
        description = clean_text(item.get("description")) or title_from_description(
            f"{evidence_a} conflicts with {evidence_b}"
        )
        if not source_a or not source_b:
            log_blob(
                LOGGER,
                "analysis.validate_contradiction.reject",
                item,
                reason="source_reference_not_found",
            )
            continue
        if not asset_id:
            log_blob(
                LOGGER,
                "analysis.validate_contradiction.reject",
                item,
                reason="invalid_asset_id",
            )
            continue
        if not evidence_a or not evidence_b:
            log_blob(
                LOGGER,
                "analysis.validate_contradiction.reject",
                item,
                reason="empty_evidence",
            )
            continue
        if not evidence_supported(evidence_a, source_a[2]) or not evidence_supported(
            evidence_b, source_b[2]
        ):
            log_blob(
                LOGGER,
                "analysis.validate_contradiction.reject",
                item,
                reason="evidence_not_in_source_text",
                source_document_a=source_a[0],
                source_page_a=source_a[1],
                source_document_b=source_b[0],
                source_page_b=source_b[1],
            )
            continue
        if not (
            evidence_supported(asset_id, source_a[2])
            or evidence_supported(asset_id, source_b[2])
        ):
            log_blob(
                LOGGER,
                "analysis.validate_contradiction.reject",
                item,
                reason="asset_id_not_in_source_text",
            )
            continue
        record = {
            "asset_id": asset_id,
            "severity": normalise_choice(item.get("severity"), ALLOWED_SEVERITIES)
            or "Medium",
            "contradiction_type": normalise_choice(
                item.get("contradiction_type") or item.get("type"),
                ALLOWED_CONTRADICTION_TYPES,
            )
            or "Unknown",
            "description": description,
            "evidence_a": evidence_a,
            "source_document_a": source_a[0],
            "source_page_a": source_a[1],
            "evidence_b": evidence_b,
            "source_document_b": source_b[0],
            "source_page_b": source_b[1],
            "status": normalise_choice(item.get("status"), ALLOWED_STATUSES) or "Open",
        }
        log_blob(LOGGER, "analysis.validate_contradiction.accept", record)
        result.append(record)
    return result


def contradiction_evidence_items(
    item: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, Any]]:
    evidence_items = item.get("evidence")
    if isinstance(evidence_items, list) and len(evidence_items) >= 2:
        first = evidence_items[0] if isinstance(evidence_items[0], dict) else {}
        second = evidence_items[1] if isinstance(evidence_items[1], dict) else {}
        return {
            "evidence": first.get("evidence")
            or first.get("text")
            or item.get("evidence_a"),
            "source_document": first.get("source_document")
            or first.get("source")
            or item.get("source_document_a"),
            "source_page": first.get("source_page")
            or first.get("page")
            or item.get("source_page_a"),
        }, {
            "evidence": second.get("evidence")
            or second.get("text")
            or item.get("evidence_b"),
            "source_document": second.get("source_document")
            or second.get("source")
            or item.get("source_document_b"),
            "source_page": second.get("source_page")
            or second.get("page")
            or item.get("source_page_b"),
        }
    return {
        "evidence": item.get("evidence_a")
        or item.get("first_evidence")
        or item.get("evidence_1"),
        "source_document": item.get("source_document_a")
        or item.get("first_source_document")
        or item.get("source_document_1"),
        "source_page": item.get("source_page_a")
        or item.get("page_a")
        or item.get("source_page_1"),
    }, {
        "evidence": item.get("evidence_b")
        or item.get("second_evidence")
        or item.get("evidence_2"),
        "source_document": item.get("source_document_b")
        or item.get("second_source_document")
        or item.get("source_document_2"),
        "source_page": item.get("source_page_b")
        or item.get("page_b")
        or item.get("source_page_2"),
    }


def source_reference(
    item: dict[str, Any], source_pages: dict[tuple[str, int], str]
) -> tuple[str, int, str, int] | None:
    log_blob(LOGGER, "analysis.source_reference.start", item)
    filename = clean_text(
        item.get("source_document")
        or item.get("source")
        or item.get("source_filename")
        or item.get("filename")
        or item.get("document")
    )
    try:
        page = int(item.get("source_page") or item.get("page"))
    except (TypeError, ValueError):
        log_blob(
            LOGGER,
            "analysis.source_reference.missing_page",
            item,
            filename=filename,
        )
        return None
    resolved = resolve_source_page(filename, page, source_pages)
    if resolved is None:
        log_blob(
            LOGGER,
            "analysis.source_reference.no_source_text",
            item,
            filename=filename,
            page=page,
        )
        return None
    filename, page, text = resolved
    document = Database.row(
        "SELECT id FROM documents WHERE workspace_id = ? AND filename = ?",
        (Database.workspace_id(), filename),
    )
    if not document:
        log_blob(
            LOGGER,
            "analysis.source_reference.document_not_found",
            item,
            filename=filename,
            page=page,
        )
        return None
    result = (filename, page, text, int(document["id"]))
    log_blob(
        LOGGER,
        "analysis.source_reference.finish",
        {
            "filename": filename,
            "page": page,
            "source_text": text,
            "document_id": int(document["id"]),
        },
    )
    return result


def resolve_source_page(
    filename: str,
    page: int,
    source_pages: dict[tuple[str, int], str],
) -> tuple[str, int, str] | None:
    direct = source_pages.get((filename, page))
    if direct is not None:
        return filename, page, direct

    requested_keys = source_filename_keys(filename)
    if not requested_keys:
        return None
    matches = [
        (source_filename, source_page, text)
        for (source_filename, source_page), text in source_pages.items()
        if source_page == page
        and requested_keys.intersection(source_filename_keys(source_filename))
    ]
    if len(matches) == 1:
        log_event(
            LOGGER,
            "analysis.source_reference.filename_resolved",
            requested=filename,
            resolved=matches[0][0],
            page=page,
        )
        return matches[0]
    if len(matches) > 1:
        log_event(
            LOGGER,
            "analysis.source_reference.ambiguous_filename",
            requested=filename,
            page=page,
            matches=[match[0] for match in matches],
        )
    return None


def source_filename_keys(value: str) -> set[str]:
    text = clean_text(value).strip("\"'` ")
    text = re.sub(r"^source:\s*", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\s+(?:page|p\.)\s+\d+\s*$", "", text, flags=re.IGNORECASE)
    text = text.replace("\\", "/")
    name = Path(text).name
    stem = Path(name).stem
    keys = {text, name, stem}
    return {normalise_evidence(key) for key in keys if key}


def source_excerpt(value: str, source_text: str, radius: int = 140) -> str:
    clean_source = clean_text(source_text)
    clean_value = clean_text(value)
    if not clean_source or not clean_value:
        return ""
    match = re.search(re.escape(clean_value), clean_source, flags=re.IGNORECASE)
    if not match:
        return clean_source[: radius * 2].strip()
    start = max(0, match.start() - radius)
    end = min(len(clean_source), match.end() + radius)
    return clean_source[start:end].strip()


def title_from_description(description: str, limit: int = 72) -> str:
    clean = clean_text(description)
    if len(clean) <= limit:
        return clean
    return f"{clean[: limit - 3].rstrip()}..."


def evidence_supported(value: str, source_text: str) -> bool:
    needle = normalise_evidence(value)
    normalised_source = normalise_evidence(source_text)
    compact_needle = compact_evidence(value)
    compact_source = compact_evidence(source_text)
    if bool(needle) and (
        needle in normalised_source or compact_needle in compact_source
    ):
        result = True
    else:
        identifiers = identifier_keys(value)
        source_identifiers = identifier_keys(source_text)
        missing_identifiers = sorted(identifiers - source_identifiers)
        value_tokens = significant_evidence_tokens(value)
        source_tokens = set(significant_evidence_tokens(source_text))
        overlap = (
            len([token for token in value_tokens if token in source_tokens])
            / len(value_tokens)
            if value_tokens
            else 0.0
        )
        result = (
            bool(value_tokens)
            and not missing_identifiers
            and (bool(identifiers) or len(value_tokens) >= 4)
            and overlap >= 0.6
        )
    log_blob(
        LOGGER,
        "analysis.evidence_supported",
        {
            "value": value,
            "needle": needle,
            "source_text": source_text,
            "supported": result,
            "identifiers": sorted(identifier_keys(value)),
            "token_overlap": evidence_token_overlap(value, source_text),
        },
    )
    return result


def normalise_evidence(value: str) -> str:
    return " ".join(value.lower().split())


def compact_evidence(value: str) -> str:
    return " ".join(re.sub(r"[^a-z0-9]+", " ", value.lower()).split())


def identifier_keys(value: str) -> set[str]:
    return {
        re.sub(r"[^A-Z0-9]+", "", match.group(0).upper())
        for match in IDENTIFIER_PATTERN.finditer(value)
    }


def significant_evidence_tokens(value: str) -> list[str]:
    tokens = []
    for match in TOKEN_PATTERN.finditer(value.lower()):
        token = match.group(0).strip(".-/")
        if not token or token in EVIDENCE_STOP_WORDS or len(token) < 2:
            continue
        tokens.append(token)
    return tokens


def evidence_token_overlap(value: str, source_text: str) -> float:
    value_tokens = significant_evidence_tokens(value)
    if not value_tokens:
        return 0.0
    source_tokens = set(significant_evidence_tokens(source_text))
    return len([token for token in value_tokens if token in source_tokens]) / len(
        value_tokens
    )


def merge_analysis(
    value: dict[str, list[dict[str, Any]]],
) -> dict[str, list[dict[str, Any]]]:
    log_blob(
        LOGGER,
        "analysis.merge.start",
        value,
        entities=len(value["entities"]),
        assets=len(value["assets"]),
        timeline_events=len(value["timeline_events"]),
        compliance_gaps=len(value["compliance_gaps"]),
        contradictions=len(value["contradictions"]),
    )
    entities = unique_records(
        value["entities"],
        lambda item: (
            item["document_id"],
            item["page"],
            item["entity_type"],
            item["value"].lower(),
        ),
    )
    assets_by_id: dict[str, dict[str, Any]] = {}
    risk_rank = {"Unknown": 0, "Low": 1, "Medium": 2, "High": 3}
    for candidate in value["assets"]:
        log_blob(LOGGER, "analysis.merge.asset.candidate", candidate)
        current = assets_by_id.get(candidate["id"])
        if not current:
            assets_by_id[candidate["id"]] = candidate
            log_blob(LOGGER, "analysis.merge.asset.new", candidate)
            continue
        if risk_rank[candidate["risk_level"]] > risk_rank[current["risk_level"]]:
            current["risk_level"] = candidate["risk_level"]
        for field in ("name", "asset_type", "location"):
            if current[field] in {"", "Unknown", current["id"]} and candidate[field]:
                current[field] = candidate[field]
        dates = [
            date
            for date in (current["last_inspection"], candidate["last_inspection"])
            if date
        ]
        current["last_inspection"] = max(dates) if dates else None
        current["suggested_actions"] = unique_strings(
            current["suggested_actions"] + candidate["suggested_actions"]
        )
        current["_source_documents"].update(candidate["_source_documents"])
        if not current.get("source_document") and candidate.get("source_document"):
            current["source_document"] = candidate["source_document"]
            current["source_page"] = candidate.get("source_page") or 1
            current["evidence_text"] = candidate.get("evidence_text", "")
        log_blob(LOGGER, "analysis.merge.asset.updated", current)
    asset_ids = set(assets_by_id)
    timelines = unique_records(
        [item for item in value["timeline_events"] if item["asset_id"] in asset_ids],
        lambda item: (
            item["asset_id"],
            item["event_date"],
            item["title"].lower(),
            item["source_document"],
            item["source_page"],
        ),
    )
    gaps_by_key: dict[tuple[str, str], dict[str, Any]] = {}
    severity_rank = {"Low": 1, "Medium": 2, "High": 3}
    status_rank = {"Closed": 0, "Monitoring": 1, "In Progress": 2, "Open": 3}
    for candidate in value["compliance_gaps"]:
        log_blob(LOGGER, "analysis.merge.gap.candidate", candidate)
        if candidate["asset_id"] not in asset_ids:
            log_blob(
                LOGGER,
                "analysis.merge.gap.rejected_missing_asset",
                candidate,
                asset_ids=asset_ids,
            )
            continue
        key = (candidate["asset_id"], candidate["gap_type"].lower())
        current = gaps_by_key.get(key)
        if not current:
            gaps_by_key[key] = candidate
            log_blob(LOGGER, "analysis.merge.gap.new", candidate)
            continue
        if severity_rank[candidate["severity"]] > severity_rank[current["severity"]]:
            current.update(candidate)
        if status_rank[candidate["status"]] > status_rank[current["status"]]:
            current["status"] = candidate["status"]
        log_blob(LOGGER, "analysis.merge.gap.updated", current)
    gaps = list(gaps_by_key.values())
    contradictions = unique_records(
        [item for item in value["contradictions"] if item["asset_id"] in asset_ids],
        lambda item: (
            item["asset_id"],
            item["contradiction_type"].lower(),
            item["evidence_a"].lower(),
            item["evidence_b"].lower(),
            item["source_document_a"],
            item["source_page_a"],
            item["source_document_b"],
            item["source_page_b"],
        ),
    )
    gap_counts: dict[str, int] = {}
    for gap in gaps:
        if gap["status"] == "Open":
            gap_counts[gap["asset_id"]] = gap_counts.get(gap["asset_id"], 0) + 1
    assets = sorted(assets_by_id.values(), key=lambda item: item["id"])
    for asset in assets:
        asset["open_compliance_gaps"] = gap_counts.get(asset["id"], 0)
    result = {
        "entities": entities,
        "assets": assets,
        "timeline_events": timelines,
        "compliance_gaps": gaps,
        "contradictions": contradictions,
    }
    log_blob(
        LOGGER,
        "analysis.merge.finish",
        result,
        entities=len(entities),
        assets=len(assets),
        timeline_events=len(timelines),
        compliance_gaps=len(gaps),
        contradictions=len(contradictions),
    )
    return result


def persist_generated_analysis(result: dict[str, list[dict[str, Any]]]) -> None:
    log_blob(
        LOGGER,
        "analysis.persist_generated_analysis.start",
        result,
        entities=len(result["entities"]),
        assets=len(result["assets"]),
        timeline_events=len(result["timeline_events"]),
        compliance_gaps=len(result["compliance_gaps"]),
        contradictions=len(result.get("contradictions", [])),
    )
    Database.replace_generated_analysis(result)
    from app.services.graph import persist_graph_edges

    persist_graph_edges()
    log_event(LOGGER, "analysis.persist_generated_analysis.finish")


def unique_records(items: list[dict[str, Any]], key: Any) -> list[dict[str, Any]]:
    log_blob(LOGGER, "analysis.unique_records.start", items, item_count=len(items))
    result: list[dict[str, Any]] = []
    seen: set[Any] = set()
    for item in items:
        identity = key(item)
        if identity in seen:
            log_blob(
                LOGGER,
                "analysis.unique_records.duplicate",
                item,
                identity=identity,
            )
            continue
        seen.add(identity)
        result.append(item)
        log_blob(LOGGER, "analysis.unique_records.keep", item, identity=identity)
    log_blob(LOGGER, "analysis.unique_records.finish", result, item_count=len(result))
    return result


def unique_strings(items: list[str]) -> list[str]:
    log_blob(LOGGER, "analysis.unique_strings.start", items, item_count=len(items))
    result: list[str] = []
    for item in items:
        if item and item not in result:
            result.append(item)
            log_event(LOGGER, "analysis.unique_strings.keep", item=item)
        elif item:
            log_event(LOGGER, "analysis.unique_strings.duplicate", item=item)
    log_blob(LOGGER, "analysis.unique_strings.finish", result, item_count=len(result))
    return result


def normalise_entity_value(entity_type: str, value: str) -> str:
    if entity_type in {"Equipment", "Work Order"}:
        result = value.upper()
    else:
        result = value
    log_event(
        LOGGER,
        "analysis.normalise_entity_value",
        entity_type=entity_type,
        value=value,
        result=result,
    )
    return result


def normalise_asset_id(value: Any) -> str:
    text = clean_text(value).upper()
    if not re.fullmatch(r"[A-Z0-9][A-Z0-9_.-]{1,79}", text):
        log_event(LOGGER, "analysis.normalise_asset_id", value=value, result="")
        return ""
    log_event(LOGGER, "analysis.normalise_asset_id", value=value, result=text)
    return text


def normalise_choice(value: Any, allowed: set[str]) -> str:
    text = clean_text(value).lower()
    result = next((item for item in allowed if item.lower() == text), "")
    log_event(
        LOGGER,
        "analysis.normalise_choice",
        value=value,
        allowed=sorted(allowed),
        result=result,
    )
    return result


def normalise_date_or_none(value: Any) -> str | None:
    text = clean_text(value)
    if not text or text.lower() == "null":
        log_event(LOGGER, "analysis.normalise_date", value=value, result=None)
        return None
    try:
        result = datetime.fromisoformat(text).date().isoformat()
        log_event(LOGGER, "analysis.normalise_date", value=value, result=result)
        return result
    except ValueError:
        log_event(
            LOGGER,
            "analysis.normalise_date",
            value=value,
            result=None,
            reason="invalid_iso_date",
        )
        return None


def clean_string_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        log_event(LOGGER, "analysis.clean_string_list", value=value, result=[])
        return []
    result = unique_strings([clean_text(item) for item in value])
    log_blob(LOGGER, "analysis.clean_string_list", result, source=value)
    return result


def clean_text(value: Any) -> str:
    if value is None:
        log_event(LOGGER, "analysis.clean_text", value=None, result="")
        return ""
    result = " ".join(str(value).replace("\x00", "").split()).strip()
    log_event(LOGGER, "analysis.clean_text", value=value, result=result)
    return result
