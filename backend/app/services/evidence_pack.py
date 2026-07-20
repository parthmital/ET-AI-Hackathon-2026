from __future__ import annotations

from datetime import datetime, timezone
import logging
from typing import Any

from app.services.database import Database
from app.services.graph import build_graph_paths
from app.services.terminal_logging import log_blob, log_event

LOGGER = logging.getLogger(__name__)


def compliance_evidence_pack() -> dict[str, Any]:
    log_event(LOGGER, "evidence_pack.compliance.start")
    gaps = Database.rows(
        """
        SELECT *
        FROM compliance_gaps
        WHERE workspace_id = ?
        ORDER BY severity, asset_id
        """,
        (Database.workspace_id(),),
    )
    log_blob(LOGGER, "evidence_pack.compliance.gaps", gaps)
    lines = [
        "# Industrial Ops Brain Compliance Evidence Pack",
        "",
        f"Generated: {datetime.now(timezone.utc).isoformat()}",
        "",
        "## Summary",
        "",
        f"- Total gaps: {len(gaps)}",
        f"- Open gaps: {len([gap for gap in gaps if gap['status'] == 'Open'])}",
        f"- High severity gaps: {len([gap for gap in gaps if gap['severity'] == 'High'])}",
    ]
    lines.extend(["", "## Findings", ""])
    for gap in gaps:
        lines.extend(gap_markdown(gap))
    result = {
        "filename": "industrial-ops-compliance-evidence-pack.md",
        "markdown": "\n".join(lines).strip() + "\n",
    }
    log_blob(LOGGER, "evidence_pack.compliance.finish", result)
    return result


def asset_evidence_pack(asset_id: str) -> dict[str, Any] | None:
    log_event(LOGGER, "evidence_pack.asset.start", asset_id=asset_id)
    asset = Database.get_asset(asset_id.upper())
    if not asset:
        log_event(LOGGER, "evidence_pack.asset.not_found", asset_id=asset_id)
        return None
    gaps = Database.rows(
        """
        SELECT *
        FROM compliance_gaps
        WHERE workspace_id = ? AND asset_id = ?
        ORDER BY severity
        """,
        (Database.workspace_id(), asset["id"]),
    )
    contradictions = Database.list_contradictions(asset["id"])
    events = Database.rows(
        """
        SELECT *
        FROM timeline_events
        WHERE workspace_id = ? AND asset_id = ?
        ORDER BY event_date DESC
        """,
        (Database.workspace_id(), asset["id"]),
    )
    documents = Database.rows(
        """
        SELECT documents.filename, documents.document_type
        FROM asset_documents
        JOIN documents ON documents.id = asset_documents.document_id
            AND documents.workspace_id = asset_documents.workspace_id
        WHERE asset_documents.workspace_id = ? AND asset_documents.asset_id = ?
        ORDER BY documents.filename
        """,
        (Database.workspace_id(), asset["id"]),
    )
    paths = build_graph_paths(asset["id"])
    log_blob(
        LOGGER,
        "evidence_pack.asset.source_data",
        {
            "asset": asset,
            "gaps": gaps,
            "contradictions": contradictions,
            "events": events,
            "documents": documents,
            "paths": paths,
        },
    )
    lines = [
        f"# Asset Evidence Pack: {asset['id']}",
        "",
        f"Generated: {datetime.now(timezone.utc).isoformat()}",
        "",
        "## Asset",
        "",
        f"- Name: {asset['name']}",
        f"- Type: {asset['asset_type']}",
        f"- Location: {asset['location']}",
        f"- Risk level: {asset['risk_level']}",
        f"- Last inspection: {asset.get('last_inspection') or 'Not available'}",
        f"- Source: {asset.get('source_document') or 'Not available'}, page {asset.get('source_page') or 1}",
        f"- Evidence: {asset.get('evidence_text') or 'Not available'}",
        "",
        "## Suggested Actions",
        "",
    ]
    suggested_actions = asset.get("suggested_actions", [])
    lines.extend(
        [f"- {action}" for action in suggested_actions] or ["- No generated action."]
    )
    lines.extend(["", "## Compliance Gaps", ""])
    if gaps:
        for gap in gaps:
            lines.extend(gap_markdown(gap))
    else:
        lines.append("- No compliance gaps linked to this asset.")
    lines.extend(["", "## Timeline", ""])
    lines.extend(
        [
            f"- {event['event_date']} | {event['event_type']} | {event['title']} | {event['source_document']}"
            for event in events
        ]
        or ["- No generated timeline events."]
    )
    lines.extend(["", "## Linked Documents", ""])
    lines.extend(
        [
            f"- {document['filename']} ({document['document_type']})"
            for document in documents
        ]
        or ["- No linked documents."]
    )
    lines.extend(["", "## Contradictions", ""])
    if contradictions:
        for contradiction in contradictions:
            lines.extend(contradiction_markdown(contradiction))
    else:
        lines.append("- No contradictions linked to this asset.")
    lines.extend(["", "## Graph Paths", ""])
    if paths:
        for path in paths:
            lines.append(f"### {path['title']}")
            lines.append("")
            lines.append(path["summary"])
            lines.append("")
            for edge in path["edges"]:
                lines.append(
                    f"- {edge['source']} -> {edge['label']} -> {edge['target']} "
                    f"({edge.get('validation_status', 'weak')}, "
                    f"confidence {edge.get('confidence', 0)})"
                )
                if edge.get("source_document"):
                    lines.append(
                        f"  Source: {edge['source_document']}, page {edge.get('source_page') or 1}"
                    )
                if edge.get("evidence_text"):
                    lines.append(f"  Evidence: {edge['evidence_text']}")
            lines.append("")
    else:
        lines.append("- No graph path generated.")
    result = {
        "filename": f"industrial-ops-{asset['id'].lower()}-evidence-pack.md",
        "markdown": "\n".join(lines).strip() + "\n",
    }
    log_blob(LOGGER, "evidence_pack.asset.finish", result)
    return result


def gap_markdown(gap: dict[str, Any]) -> list[str]:
    log_blob(LOGGER, "evidence_pack.gap_markdown.start", gap)
    result = [
        f"### {gap['asset_id']} | {gap['gap_type']}",
        "",
        f"- Severity: {gap['severity']}",
        f"- Status: {gap['status']}",
        f"- Description: {gap['description']}",
        f"- Evidence: {gap['evidence']}",
        f"- Source: {gap.get('source_document') or 'Not available'}, page {gap.get('source_page') or 1}",
        f"- Evidence status: {gap.get('evidence_status') or 'accepted'}",
        f"- Corrective action: {gap['corrective_action']}",
        "",
    ]
    log_blob(LOGGER, "evidence_pack.gap_markdown.finish", result)
    return result


def contradiction_markdown(contradiction: dict[str, Any]) -> list[str]:
    result = [
        f"### {contradiction['asset_id']} | {contradiction['contradiction_type']}",
        "",
        f"- Severity: {contradiction['severity']}",
        f"- Status: {contradiction['status']}",
        f"- Description: {contradiction['description']}",
        f"- Evidence A: {contradiction['evidence_a']}",
        f"- Source A: {contradiction['source_document_a']}, page {contradiction['source_page_a']}",
        f"- Evidence B: {contradiction['evidence_b']}",
        f"- Source B: {contradiction['source_document_b']}, page {contradiction['source_page_b']}",
        "",
    ]
    log_blob(LOGGER, "evidence_pack.contradiction_markdown.finish", result)
    return result
