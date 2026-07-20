from __future__ import annotations

from collections import Counter, defaultdict
import json
import logging
import re
from typing import Any

import networkx as nx

from app.services.database import Database
from app.services.terminal_logging import log_blob, log_event

LOGGER = logging.getLogger(__name__)

ENTITY_EDGE_LABELS = {
    "Audit Status": "EQUIPMENT_HAS_AUDIT_STATUS",
    "Document Date": "EQUIPMENT_HAS_DOCUMENT_DATE",
    "Failure Mode": "EQUIPMENT_HAS_FAILURE",
    "Historian Signal": "EQUIPMENT_HAS_HISTORIAN_SIGNAL",
    "Inspection Date": "EQUIPMENT_HAS_INSPECTION_DATE",
    "Location": "EQUIPMENT_LOCATED_IN",
    "Maintenance Activity": "EQUIPMENT_HAS_MAINTENANCE_ACTIVITY",
    "Permit Control": "PROCEDURE_REQUIRES_PERMIT_CONTROL",
    "Person": "EQUIPMENT_HAS_PERSON_REFERENCE",
    "PPE Requirement": "PROCEDURE_REQUIRES_PPE",
    "Process Parameter": "EQUIPMENT_HAS_PROCESS_PARAMETER",
    "Regulation": "PROCEDURE_REFERENCES_REGULATION",
    "Safety Hazard": "EQUIPMENT_EXPOSED_TO_HAZARD",
    "Spare Part": "MAINTENANCE_USES_SPARE",
    "Work Order": "EQUIPMENT_HAS_WORK_ORDER",
}

GRAPH_TYPE_COLUMNS = {
    "Location": -1,
    "Equipment": 0,
    "Historian Signal": 1,
    "Process Parameter": 1,
    "Failure Mode": 2,
    "Safety Hazard": 2,
    "Maintenance Activity": 3,
    "Maintenance Event": 3,
    "Work Order": 3,
    "Spare Part": 4,
    "Permit Control": 4,
    "PPE Requirement": 4,
    "Audit Status": 5,
    "Compliance Gap": 5,
    "Contradiction": 5,
    "Inspection Date": 5,
    "Regulation": 6,
    "Person": 6,
    "Document Date": 6,
    "Document": 7,
}

VALIDATION_STATUSES = {"accepted", "weak", "rejected"}


def persist_graph_edges() -> list[dict[str, Any]]:
    log_event(LOGGER, "graph.persist_edges.start")
    data = graph_source_data()
    edges = derive_graph_edges(**data)
    Database.replace_graph_edges(edges)
    log_blob(LOGGER, "graph.persist_edges.finish", edges, edge_count=len(edges))
    return edges


def build_graph_response() -> dict[str, Any]:
    log_event(LOGGER, "graph.response.start")
    data = graph_source_data(limit=True)
    graph = nx.MultiDiGraph()
    add_graph_nodes(graph, data)

    persisted_edges = Database.list_graph_edges()
    edges = persisted_edges or derive_graph_edges(**graph_source_data(limit=False))
    edge_keys: set[tuple[str, str, str, str, str]] = set()
    for edge in edges:
        if not graph.has_node(edge["source_id"]) or not graph.has_node(
            edge["target_id"]
        ):
            continue
        key = (
            edge["source_id"],
            edge["target_id"],
            edge["relation_type"],
            edge.get("source_document", ""),
            edge.get("evidence_text", ""),
        )
        if key in edge_keys:
            continue
        edge_keys.add(key)
        graph.add_edge(
            edge["source_id"],
            edge["target_id"],
            **normalise_graph_edge_payload(edge),
        )
        log_event(
            LOGGER,
            "graph.edge.added",
            source=edge["source_id"],
            target=edge["target_id"],
            relation_type=edge["relation_type"],
            validation_status=edge["validation_status"],
        )

    positions = layout_graph_positions(graph)
    response_edges = [
        graph_edge_response(index, source, target, data)
        for index, (source, target, data) in enumerate(graph.edges(data=True))
    ]
    audit = edge_audit(response_edges)
    result = {
        "nodes": [
            {
                "id": node_id,
                "data": {
                    "label": data["label"],
                    "type": data["type"],
                    "details": data.get("details", {}),
                },
                "position": positions[node_id],
            }
            for node_id, data in graph.nodes(data=True)
        ],
        "edges": response_edges,
        "edge_audit": audit,
    }
    log_blob(
        LOGGER,
        "graph.response.finish",
        result,
        node_count=len(result["nodes"]),
        edge_count=len(result["edges"]),
        edge_audit=audit,
    )
    return result


def graph_source_data(limit: bool = False) -> dict[str, Any]:
    workspace_id = Database.workspace_id()
    documents = Database.list_documents()
    entities = Database.list_entities()
    assets = Database.list_assets()
    gaps = Database.rows(
        """
        SELECT *
        FROM compliance_gaps
        WHERE workspace_id = ?
        ORDER BY id
        """,
        (workspace_id,),
    )
    events = Database.rows(
        """
        SELECT *
        FROM timeline_events
        WHERE workspace_id = ?
        ORDER BY id
        """,
        (workspace_id,),
    )
    contradictions = Database.list_contradictions()
    asset_documents = Database.rows(
        """
        SELECT asset_id, document_id
        FROM asset_documents
        WHERE workspace_id = ?
        """,
        (workspace_id,),
    )
    if limit:
        events = limit_graph_events(events)
        gaps = limit_graph_gaps(gaps)
    result = {
        "documents": documents,
        "entities": entities,
        "assets": assets,
        "gaps": gaps,
        "events": events,
        "asset_documents": asset_documents,
        "contradictions": contradictions,
    }
    log_blob(LOGGER, "graph.source_data", result)
    return result


def add_graph_nodes(graph: nx.MultiDiGraph, data: dict[str, Any]) -> None:
    asset_ids = {asset["id"] for asset in data["assets"]}
    for document in data["documents"]:
        graph.add_node(
            f"Document:{document['id']}",
            label=document["filename"],
            type="Document",
            details={"document_type": document["document_type"]},
        )

    for asset in data["assets"]:
        graph.add_node(
            asset["id"],
            label=asset["name"],
            type="Equipment",
            details={
                "asset_type": asset["asset_type"],
                "risk_level": asset["risk_level"],
                "location": asset["location"],
                "source_document": asset.get("source_document", ""),
                "source_page": asset.get("source_page", 1),
                "evidence_text": asset.get("evidence_text", ""),
            },
        )
        if asset["location"] and asset["location"] != "Unknown":
            graph.add_node(
                f"Location:{asset['location']}",
                label=asset["location"],
                type="Location",
                details={},
            )

    for entity in data["entities"]:
        if entity["entity_type"] == "Equipment":
            entity_id = entity["value"]
            if entity_id not in asset_ids and not graph.has_node(entity_id):
                graph.add_node(
                    entity_id,
                    label=entity["value"],
                    type="Equipment",
                    details={
                        "confidence": entity["confidence"],
                        "source": "extracted entity",
                    },
                )
            continue
        graph.add_node(
            f"{entity['entity_type']}:{entity['value']}",
            label=entity["value"],
            type=entity["entity_type"],
            details={
                "confidence": entity["confidence"],
                "source_document": entity.get("filename", ""),
                "source_page": entity.get("page", 1),
            },
        )

    for event in data["events"]:
        graph.add_node(
            f"Maintenance Event:{event['id']}",
            label=event["title"],
            type="Maintenance Event",
            details=event,
        )

    for gap in data["gaps"]:
        graph.add_node(
            f"Compliance Gap:{gap['id']}",
            label=gap["gap_type"],
            type="Compliance Gap",
            details=gap,
        )

    for contradiction in data["contradictions"]:
        graph.add_node(
            f"Contradiction:{contradiction['id']}",
            label=contradiction["contradiction_type"],
            type="Contradiction",
            details=contradiction,
        )


def derive_graph_edges(
    documents: list[dict[str, Any]],
    entities: list[dict[str, Any]],
    assets: list[dict[str, Any]],
    gaps: list[dict[str, Any]],
    events: list[dict[str, Any]],
    asset_documents: list[dict[str, Any]],
    contradictions: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    log_event(LOGGER, "graph.derive_edges.start")
    document_by_id = {int(document["id"]): document for document in documents}
    assets_by_id = {asset["id"]: asset for asset in assets}
    asset_ids = set(assets_by_id)
    edges: list[dict[str, Any]] = []
    seen: set[tuple[str, str, str, str, str]] = set()

    def add(edge: dict[str, Any]) -> None:
        key = (
            edge["source_id"],
            edge["target_id"],
            edge["relation_type"],
            edge.get("source_document", ""),
            edge.get("evidence_text", ""),
        )
        if key in seen:
            return
        seen.add(key)
        edges.append(edge)

    for asset in assets:
        if asset["location"] and asset["location"] != "Unknown":
            add(
                graph_edge_record(
                    asset["id"],
                    f"Location:{asset['location']}",
                    "EQUIPMENT_LOCATED_IN",
                    0.72,
                    asset.get("source_document", ""),
                    asset.get("source_page", 1),
                    asset.get("evidence_text", ""),
                )
            )

    for entity in entities:
        document_id = f"Document:{entity['document_id']}"
        source_document = str(entity.get("filename", ""))
        source_page = int(entity.get("page") or 1)
        evidence_text = str(entity.get("context", ""))
        if entity["entity_type"] == "Equipment":
            entity_id = entity["value"]
            add(
                graph_edge_record(
                    entity_id,
                    document_id,
                    "EQUIPMENT_MENTIONED_IN_DOCUMENT",
                    float(entity.get("confidence") or 0),
                    source_document,
                    source_page,
                    evidence_text,
                )
            )
            continue

        entity_id = f"{entity['entity_type']}:{entity['value']}"
        add(
            graph_edge_record(
                entity_id,
                document_id,
                "MENTIONED_IN_DOCUMENT",
                float(entity.get("confidence") or 0),
                source_document,
                source_page,
                evidence_text,
            )
        )
        for asset_id in related_asset_ids(entity, asset_ids):
            add(
                graph_edge_record(
                    asset_id,
                    entity_id,
                    ENTITY_EDGE_LABELS.get(
                        entity["entity_type"], "EQUIPMENT_RELATED_TO_ENTITY"
                    ),
                    float(entity.get("confidence") or 0),
                    source_document,
                    source_page,
                    evidence_text,
                )
            )

    for event in events:
        add(
            graph_edge_record(
                event["asset_id"],
                f"Maintenance Event:{event['id']}",
                "EQUIPMENT_HAS_MAINTENANCE_EVENT",
                0.86,
                event.get("source_document", ""),
                event.get("source_page", 1),
                event.get("description", ""),
            )
        )

    for link in asset_documents:
        asset = assets_by_id.get(link["asset_id"], {})
        document = document_by_id.get(int(link["document_id"]))
        add(
            graph_edge_record(
                link["asset_id"],
                f"Document:{link['document_id']}",
                "EQUIPMENT_SUPPORTED_BY_DOCUMENT",
                0.58,
                document["filename"] if document else asset.get("source_document", ""),
                asset.get("source_page", 1),
                asset.get("evidence_text", ""),
                force_status="weak",
                validation_reason="Asset-document support is an indirect derived link.",
            )
        )

    for gap in gaps:
        add(
            graph_edge_record(
                gap["asset_id"],
                f"Compliance Gap:{gap['id']}",
                "EQUIPMENT_HAS_COMPLIANCE_GAP",
                0.9,
                gap.get("source_document", ""),
                gap.get("source_page", 1),
                gap.get("evidence", ""),
            )
        )

    for contradiction in contradictions:
        add(
            graph_edge_record(
                contradiction["asset_id"],
                f"Contradiction:{contradiction['id']}",
                "EQUIPMENT_HAS_CONTRADICTION",
                0.82,
                contradiction.get("source_document_a", ""),
                contradiction.get("source_page_a", 1),
                contradiction.get("evidence_a", ""),
            )
        )

    log_blob(LOGGER, "graph.derive_edges.finish", edges, edge_count=len(edges))
    return edges


def graph_edge_record(
    source_id: str,
    target_id: str,
    relation_type: str,
    confidence: float,
    source_document: str,
    source_page: int,
    evidence_text: str,
    force_status: str | None = None,
    validation_reason: str = "",
) -> dict[str, Any]:
    confidence = round(max(0.0, min(1.0, float(confidence))), 2)
    source_document = str(source_document or "")
    evidence_text = str(evidence_text or "")
    if force_status in VALIDATION_STATUSES:
        validation_status = force_status
        reason = validation_reason or "Relationship status was set by derivation rule."
    elif not source_document or not evidence_text:
        validation_status = "rejected"
        reason = "Relationship is missing a source document or evidence snippet."
    elif confidence >= 0.7:
        validation_status = "accepted"
        reason = "Relationship has source evidence and sufficient confidence."
    else:
        validation_status = "weak"
        reason = "Relationship has source evidence but lower confidence."
    result = {
        "source_id": str(source_id),
        "target_id": str(target_id),
        "source_node": str(source_id),
        "target_node": str(target_id),
        "label": relation_type,
        "relation_type": relation_type,
        "confidence": confidence,
        "source_document": source_document,
        "source_page": int(source_page or 1),
        "evidence_text": evidence_text,
        "validation_status": validation_status,
        "validation_reason": reason,
    }
    log_blob(LOGGER, "graph.edge_record", result)
    return result


def normalise_graph_edge_payload(edge: dict[str, Any]) -> dict[str, Any]:
    relation_type = str(edge.get("relation_type") or edge.get("label") or "RELATED_TO")
    return {
        "label": str(edge.get("label") or relation_type),
        "relation_type": relation_type,
        "confidence": float(edge.get("confidence") or 0.0),
        "source_document": str(edge.get("source_document") or ""),
        "source_page": int(edge.get("source_page") or 1),
        "evidence_text": str(edge.get("evidence_text") or ""),
        "validation_status": str(edge.get("validation_status") or "weak"),
        "validation_reason": str(edge.get("validation_reason") or ""),
    }


def graph_edge_response(
    index: int, source: str, target: str, data: dict[str, Any]
) -> dict[str, Any]:
    relation_type = str(data.get("relation_type") or data.get("label") or "RELATED_TO")
    source_node = str(data.get("source_node") or source)
    target_node = str(data.get("target_node") or target)
    return {
        "id": f"{source}-{target}-{index}",
        "source": source,
        "target": target,
        "source_node": source_node,
        "target_node": target_node,
        "label": str(data.get("label") or relation_type),
        "relation_type": relation_type,
        "confidence": round(float(data.get("confidence") or 0.0), 2),
        "source_document": str(data.get("source_document") or ""),
        "source_page": int(data.get("source_page") or 1),
        "evidence_text": str(data.get("evidence_text") or ""),
        "validation_status": str(data.get("validation_status") or "weak"),
        "validation_reason": str(data.get("validation_reason") or ""),
    }


def edge_audit(edges: list[dict[str, Any]]) -> dict[str, int]:
    counts = Counter(str(edge.get("validation_status") or "weak") for edge in edges)
    return {
        "accepted": counts.get("accepted", 0),
        "weak": counts.get("weak", 0),
        "rejected": counts.get("rejected", 0),
        "total": len(edges),
    }


def related_asset_ids(entity: dict[str, Any], asset_ids: set[str]) -> list[str]:
    haystack = " ".join(
        str(entity.get(key, ""))
        for key in ("value", "context", "filename", "source_document")
    ).upper()
    return sorted(asset_id for asset_id in asset_ids if asset_id.upper() in haystack)


def layout_graph_positions(graph: nx.MultiDiGraph) -> dict[str, dict[str, int]]:
    groups: dict[int, list[str]] = defaultdict(list)
    for node_id, data in graph.nodes(data=True):
        column = GRAPH_TYPE_COLUMNS.get(data.get("type", ""), 8)
        groups[column].append(node_id)
    if not groups:
        return {}

    min_column = min(groups)
    positions: dict[str, dict[str, int]] = {}
    for column in sorted(groups):
        nodes = sorted(
            groups[column],
            key=lambda node_id: (
                -graph.degree(node_id),
                str(graph.nodes[node_id].get("type", "")),
                str(graph.nodes[node_id].get("label", "")),
            ),
        )
        for index, node_id in enumerate(nodes):
            positions[node_id] = {
                "x": (column - min_column) * 260,
                "y": index * 128,
            }
    return positions


def limit_graph_events(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for event in events:
        groups[str(event.get("asset_id", ""))].append(event)

    selected: list[dict[str, Any]] = []
    for asset_events in groups.values():
        selected.extend(
            sorted(
                asset_events,
                key=lambda item: (
                    str(item.get("event_date", "")),
                    event_type_rank(str(item.get("event_type", ""))),
                    int(item.get("id", 0)),
                ),
                reverse=True,
            )[:4]
        )
    return selected


def limit_graph_gaps(gaps: list[dict[str, Any]]) -> list[dict[str, Any]]:
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for gap in gaps:
        groups[str(gap.get("asset_id", ""))].append(gap)

    selected: list[dict[str, Any]] = []
    for asset_gaps in groups.values():
        selected.extend(
            sorted(
                asset_gaps,
                key=lambda item: (
                    severity_rank(str(item.get("severity", ""))),
                    int(item.get("id", 0)),
                ),
                reverse=True,
            )[:3]
        )
    return selected


def event_type_rank(value: str) -> int:
    ranks = {
        "Incident": 5,
        "Historian Signal": 4,
        "Inspection": 3,
        "Service": 2,
        "Work Order": 1,
    }
    return ranks.get(value, 0)


def severity_rank(value: str) -> int:
    return {"High": 3, "Medium": 2, "Low": 1}.get(value, 0)


def build_graph_paths(asset_id: str | None = None) -> list[dict[str, Any]]:
    log_event(LOGGER, "graph.paths.start", asset_id=asset_id)
    graph = build_graph_response()
    node_lookup = {
        node["id"]: {
            "id": node["id"],
            "label": node["data"]["label"],
            "type": node["data"]["type"],
        }
        for node in graph["nodes"]
    }
    assets = [
        asset
        for asset in Database.list_assets()
        if asset_id is None or asset["id"].upper() == asset_id.upper()
    ]
    paths: list[dict[str, Any]] = []
    for asset in assets:
        path = graph_path_for_asset(asset, graph["edges"], node_lookup)
        if path:
            paths.append(path)
    log_blob(
        LOGGER, "graph.paths.finish", paths, asset_id=asset_id, path_count=len(paths)
    )
    return paths


def graph_path_for_asset(
    asset: dict[str, Any],
    edges: list[dict[str, Any]],
    node_lookup: dict[str, dict[str, Any]],
) -> dict[str, Any] | None:
    asset_id = asset["id"]
    related_edges = [
        edge
        for edge in edges
        if edge["source"] == asset_id or edge["target"] == asset_id
    ]
    related_edges = sorted(
        related_edges,
        key=lambda edge: (
            validation_rank(edge["validation_status"]),
            float(edge.get("confidence") or 0.0),
            edge["relation_type"],
        ),
        reverse=True,
    )[:12]
    if not related_edges:
        return None
    node_ids = {asset_id}
    for edge in related_edges:
        node_ids.add(edge["source"])
        node_ids.add(edge["target"])
    nodes = [
        node_lookup[node_id] for node_id in sorted(node_ids) if node_id in node_lookup
    ]
    confidence = round(
        sum(float(edge.get("confidence") or 0.0) for edge in related_edges)
        / len(related_edges),
        2,
    )
    result = {
        "asset_id": asset_id,
        "title": f"{asset_id} linked evidence path",
        "summary": (
            f"{asset_id} connects generated asset intelligence to extracted "
            "evidence, events, gaps, contradictions, and source documents."
        ),
        "nodes": nodes,
        "edges": related_edges,
        "confidence": confidence,
    }
    log_blob(LOGGER, "graph.path_for_asset.finish", result, asset_id=asset_id)
    return result


def validation_rank(status: str) -> int:
    return {"accepted": 3, "weak": 2, "rejected": 1}.get(status, 0)


def build_graph_export(format: str) -> dict[str, Any]:
    requested_format = format.lower()
    if requested_format == "json":
        graph = build_graph_response()
        return {
            "filename": "industrial-ops-graph.json",
            "format": "json",
            "content": json.dumps(graph, indent=2, ensure_ascii=True),
        }
    if requested_format == "cypher":
        return {
            "filename": "industrial-ops-graph.cypher",
            "format": "cypher",
            "content": graph_to_cypher(build_graph_response()),
        }
    raise ValueError("Graph export format must be cypher or json.")


def graph_to_cypher(graph: dict[str, Any]) -> str:
    lines = [
        "// Industrial Ops Brain graph export",
        "// Neo4j import is export-only; the app does not require Neo4j at runtime.",
    ]
    for node in graph["nodes"]:
        node_id = cypher_string(node["id"])
        label = cypher_string(node["data"]["label"])
        node_type = cypher_string(node["data"]["type"])
        details = cypher_string(
            json.dumps(node["data"].get("details", {}), ensure_ascii=True)
        )
        lines.append(
            f"MERGE (n:EvidenceNode {{id: {node_id}}}) "
            f"SET n.label = {label}, n.type = {node_type}, "
            f"n.details_json = {details};"
        )
    for edge in graph["edges"]:
        relation_type = cypher_relation(edge["relation_type"])
        properties = {
            "label": edge["label"],
            "relation_type": edge["relation_type"],
            "source_node": edge.get("source_node", edge["source"]),
            "target_node": edge.get("target_node", edge["target"]),
            "confidence": edge["confidence"],
            "source_document": edge["source_document"],
            "source_page": edge["source_page"],
            "evidence_text": edge["evidence_text"],
            "validation_status": edge["validation_status"],
            "validation_reason": edge["validation_reason"],
        }
        lines.append(
            f"MATCH (a:EvidenceNode {{id: {cypher_string(edge['source'])}}}), "
            f"(b:EvidenceNode {{id: {cypher_string(edge['target'])}}}) "
            f"MERGE (a)-[r:{relation_type}]->(b) SET r += "
            f"{cypher_properties(properties)};"
        )
    return "\n".join(lines) + "\n"


def cypher_relation(value: str) -> str:
    relation = re.sub(r"[^A-Z0-9_]+", "_", value.upper()).strip("_")
    return relation or "RELATED_TO"


def cypher_properties(properties: dict[str, Any]) -> str:
    parts = []
    for key, value in properties.items():
        if isinstance(value, (int, float)):
            rendered = str(value)
        else:
            rendered = cypher_string(str(value))
        parts.append(f"{key}: {rendered}")
    return "{" + ", ".join(parts) + "}"


def cypher_string(value: str) -> str:
    escaped = value.replace("\\", "\\\\").replace("'", "\\'")
    return f"'{escaped}'"
