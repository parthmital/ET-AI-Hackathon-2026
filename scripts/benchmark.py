from __future__ import annotations

import csv
from datetime import datetime, timezone
import json
import math
import os
from pathlib import Path
import re
import statistics
import sys
import time
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = REPO_ROOT / "backend"
FIXTURE_PATH = REPO_ROOT / "benchmarks" / "industrial_ops_benchmark.json"
RESULT_PATH = REPO_ROOT / "docs" / "benchmark_results.json"
SCORECARD_PATH = REPO_ROOT / "docs" / "benchmark_scorecard.md"

os.environ["ENABLE_OCR"] = os.getenv("BENCHMARK_ENABLE_OCR", "false")
sys.path.insert(0, str(BACKEND_ROOT))

from app.services.graph import graph_edge_record, graph_edge_response  # noqa: E402
from app.services.chunker import chunk_pages  # noqa: E402
from app.services.analysis.pipeline import evidence_supported  # noqa: E402
from app.services.parsers import parse_document  # noqa: E402

SUPPORTED_SAMPLE_EXTENSIONS = {".pdf", ".docx", ".txt", ".csv", ".xlsx"}
TOKEN_PATTERN = re.compile(r"[a-z0-9]+(?:[-./][a-z0-9]+)*", re.IGNORECASE)
RETRIEVAL_STOP_WORDS = {
    "a",
    "after",
    "all",
    "and",
    "are",
    "as",
    "at",
    "be",
    "before",
    "by",
    "does",
    "for",
    "from",
    "has",
    "in",
    "is",
    "it",
    "must",
    "of",
    "on",
    "or",
    "should",
    "the",
    "to",
    "what",
    "when",
    "where",
    "which",
    "why",
    "with",
}


def main() -> None:
    fixture = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    started_at = time.perf_counter()
    corpus, parse_elapsed_ms = parse_corpus(fixture)
    checks = run_checks(fixture, corpus)
    elapsed_ms = round((time.perf_counter() - started_at) * 1000, 2)
    passed = len([check for check in checks if check["passed"]])
    result = {
        "benchmark": fixture["name"],
        "description": fixture.get("description", ""),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "elapsed_ms": elapsed_ms,
        "parse_elapsed_ms": parse_elapsed_ms,
        "passed": passed,
        "failed": len(checks) - passed,
        "total": len(checks),
        "score": round(passed / len(checks), 4) if checks else 0,
        "metrics": benchmark_metrics(fixture, checks, elapsed_ms, parse_elapsed_ms),
        "quality_gates": quality_gate_results(
            fixture, checks, elapsed_ms, parse_elapsed_ms
        ),
        "checks": checks,
    }
    RESULT_PATH.parent.mkdir(parents=True, exist_ok=True)
    RESULT_PATH.write_text(json.dumps(result, indent=2), encoding="utf-8")
    SCORECARD_PATH.write_text(scorecard_markdown(result), encoding="utf-8")
    print(
        f"Benchmark score: {passed}/{len(checks)} "
        f"({round(result['score'] * 100, 1)}%)."
    )
    print_metrics(result["metrics"])
    print(f"Wrote {RESULT_PATH.relative_to(REPO_ROOT)}")
    print(f"Wrote {SCORECARD_PATH.relative_to(REPO_ROOT)}")
    if result["failed"] or not all(gate["passed"] for gate in result["quality_gates"]):
        raise SystemExit(1)


def parse_corpus(fixture: dict[str, Any]) -> tuple[dict[str, dict[str, Any]], float]:
    started_at = time.perf_counter()
    corpus: dict[str, dict[str, Any]] = {}
    for relative_path in fixture.get("source_documents", []):
        path = repo_path(relative_path)
        parse_started_at = time.perf_counter()
        try:
            parsed = parse_document(path)
            error = ""
        except Exception as exc:
            parsed = {
                "pages": [],
                "text": "",
                "page_count": 0,
                "metadata": {},
            }
            error = f"{type(exc).__name__}: {exc}"
        corpus[relative_path] = {
            "path": relative_path,
            "parsed": parsed,
            "error": error,
            "elapsed_ms": round((time.perf_counter() - parse_started_at) * 1000, 2),
        }
    return corpus, round((time.perf_counter() - started_at) * 1000, 2)


def run_checks(
    fixture: dict[str, Any], corpus: dict[str, dict[str, Any]]
) -> list[dict[str, Any]]:
    checks: list[dict[str, Any]] = []
    runners = (
        ("qa", "qa_evidence", fixture.get("qa_checks", []), run_qa_check),
        (
            "retrieval",
            "retrieval_ranking",
            fixture.get("retrieval_checks", []),
            run_retrieval_check,
        ),
        (
            "grounding",
            "grounded_answer",
            fixture.get("grounded_answer_checks", []),
            run_grounded_answer_check,
        ),
        (
            "abstention",
            "no_answer",
            fixture.get("abstention_checks", []),
            run_abstention_check,
        ),
        ("entity", "entity_recall", fixture.get("entity_checks", []), run_entity_check),
        (
            "numeric",
            "domain_logic",
            fixture.get("numeric_checks", []),
            run_numeric_check,
        ),
        (
            "compliance",
            "compliance_gap",
            fixture.get("compliance_checks", []),
            run_multi_evidence_check,
        ),
        (
            "contradiction",
            "conflict_pair",
            fixture.get("contradiction_checks", []),
            run_contradiction_check,
        ),
        ("rca", "rca_evidence", fixture.get("rca_checks", []), run_rca_check),
        ("graph", "graph_link", fixture.get("graph_checks", []), run_graph_check),
        (
            "graph_validation",
            "edge_validation",
            fixture.get("graph_validation_checks", []),
            run_graph_validation_check,
        ),
        (
            "parser",
            "parser_contract",
            fixture.get("parser_checks", []),
            run_parser_check,
        ),
    )
    for category, check_type, items, runner in runners:
        for item in items:
            checks.append(timed_check(category, check_type, item, corpus, runner))
    return checks


def timed_check(
    category: str,
    check_type: str,
    check: dict[str, Any],
    corpus: dict[str, dict[str, Any]],
    runner: Any,
) -> dict[str, Any]:
    started_at = time.perf_counter()
    try:
        passed, detail, evidence, metrics = runner(check, corpus)
    except Exception as exc:
        passed = False
        detail = f"{type(exc).__name__}: {exc}"
        evidence = []
        metrics = {}
    return {
        "id": check["id"],
        "category": category,
        "type": check_type,
        "passed": passed,
        "detail": detail,
        "evidence": evidence,
        "metrics": metrics,
        "elapsed_ms": round((time.perf_counter() - started_at) * 1000, 2),
    }


def run_qa_check(
    check: dict[str, Any], corpus: dict[str, dict[str, Any]]
) -> tuple[bool, str, list[dict[str, Any]], dict[str, Any]]:
    citation = check["expected_citation"]
    terms = unique_terms(
        check.get("expected_answer_terms", []) + citation.get("contains", [])
    )
    evidence = evidence_match(
        corpus,
        citation["file"],
        int(citation.get("page", 1)),
        terms,
    )
    answer_terms = matched_terms(evidence["page_text"], check["expected_answer_terms"])
    citation_hit = not evidence["missing_terms"]
    answer_hit = len(answer_terms) == len(check.get("expected_answer_terms", []))
    passed = citation_hit and answer_hit
    detail = (
        f"citation_hit={citation_hit}; "
        f"answer_terms={len(answer_terms)}/{len(check.get('expected_answer_terms', []))}"
    )
    return (
        passed,
        detail,
        [public_evidence(evidence)],
        {
            "citation_hit": citation_hit,
            "answer_hit": answer_hit,
        },
    )


def run_retrieval_check(
    check: dict[str, Any], corpus: dict[str, dict[str, Any]]
) -> tuple[bool, str, list[dict[str, Any]], dict[str, Any]]:
    limit = int(check.get("top_k", 5))
    relevant_contexts = check.get("relevant_contexts", [])
    ranked = retrieve_contexts(check["query"], corpus, limit=limit)
    metrics = retrieval_metric_values(ranked, relevant_contexts, limit)
    coverage = [
        evidence_match(corpus, item["file"], int(item.get("page", 1)), item["contains"])
        for item in relevant_contexts
    ]
    minimums = {
        "context_recall": float(check.get("minimum_context_recall", 1.0)),
        "context_precision": float(check.get("minimum_context_precision", 0.5)),
        "mrr": float(check.get("minimum_mrr", 0.5)),
        "ndcg_at_k": float(check.get("minimum_ndcg_at_k", 0.7)),
    }
    evidence_coverage_hit = all(not item["missing_terms"] for item in coverage)
    passed = evidence_coverage_hit and all(
        metrics[name] >= expected for name, expected in minimums.items()
    )
    detail = (
        f"recall@{limit}={metrics['context_recall']}; "
        f"context_precision={metrics['context_precision']}; "
        f"mrr={metrics['mrr']}; ndcg@{limit}={metrics['ndcg_at_k']}; "
        f"evidence_coverage={evidence_coverage_hit}"
    )
    evidence = [public_retrieval_evidence(item, relevant_contexts) for item in ranked]
    if len(evidence) < limit:
        evidence.extend(
            public_evidence(item) for item in coverage if item["missing_terms"]
        )
    metrics["retrieval_hit"] = passed
    return passed, detail, evidence, metrics


def run_grounded_answer_check(
    check: dict[str, Any], corpus: dict[str, dict[str, Any]]
) -> tuple[bool, str, list[dict[str, Any]], dict[str, Any]]:
    claim_results = []
    evidence_items: list[dict[str, Any]] = []
    for claim in check.get("claims", []):
        claim_evidence = [
            evidence_match(
                corpus,
                item["file"],
                int(item.get("page", 1)),
                item.get("contains", []),
            )
            for item in claim.get("evidence", [])
        ]
        evidence_items.extend(claim_evidence)
        combined_text = " ".join(item["page_text"] for item in claim_evidence)
        terms = unique_terms(claim.get("terms", []))
        missing_claim_terms = missing_terms_in_text(combined_text, terms)
        text_supported = (
            evidence_supported(str(claim.get("claim", "")), combined_text)
            if combined_text.strip() and claim.get("claim")
            else False
        )
        term_supported = not missing_claim_terms and all(
            not item["missing_terms"] for item in claim_evidence
        )
        claim_results.append(
            {
                "claim": claim.get("claim", ""),
                "term_supported": term_supported,
                "text_supported": text_supported,
                "missing_terms": missing_claim_terms,
            }
        )
    supported_claims = len([item for item in claim_results if item["term_supported"]])
    claim_count = len(claim_results)
    claim_precision = ratio(supported_claims, claim_count)
    claim_recall = ratio(supported_claims, claim_count)
    claim_f1 = f1(claim_precision, claim_recall)
    citation_coverage = ratio(
        len([item for item in evidence_items if not item["missing_terms"]]),
        len(evidence_items),
    )
    faithful_claim_rate = ratio(
        len([item for item in claim_results if item["text_supported"]]),
        claim_count,
    )
    passed = claim_f1 >= float(
        check.get("minimum_claim_f1", 1.0)
    ) and citation_coverage >= float(check.get("minimum_citation_coverage", 1.0))
    detail = (
        f"claims={supported_claims}/{claim_count}; "
        f"claim_f1={claim_f1}; citation_coverage={citation_coverage}; "
        f"text_support={faithful_claim_rate}"
    )
    return (
        passed,
        detail,
        [public_evidence(item) for item in evidence_items],
        {
            "answer_claim_precision": claim_precision,
            "answer_claim_recall": claim_recall,
            "answer_claim_f1": claim_f1,
            "citation_coverage": citation_coverage,
            "faithfulness_proxy": faithful_claim_rate,
            "grounded_answer_hit": passed,
        },
    )


def run_abstention_check(
    check: dict[str, Any], corpus: dict[str, dict[str, Any]]
) -> tuple[bool, str, list[dict[str, Any]], dict[str, Any]]:
    corpus_text = " ".join(
        str(record["parsed"].get("text", "")) for record in corpus.values()
    )
    absent_terms = check.get("absent_terms", [])
    absent_hits = missing_terms_in_text(corpus_text, absent_terms)
    unsupported_terms_absent = len(absent_hits) == len(absent_terms)
    ranked = retrieve_contexts(check["query"], corpus, limit=int(check.get("top_k", 3)))
    top_score = float(ranked[0]["score"]) if ranked else 0.0
    max_top_score = float(check.get("maximum_top_score", float("inf")))
    passed = unsupported_terms_absent and top_score <= max_top_score
    detail = (
        f"unsupported_terms_absent={unsupported_terms_absent}; "
        f"top_score={round(top_score, 4)}; max_top_score={max_top_score}"
    )
    evidence = [public_retrieval_evidence(item, []) for item in ranked]
    return (
        passed,
        detail,
        evidence,
        {
            "abstention_hit": passed,
            "unsupported_terms_absent": unsupported_terms_absent,
            "top_retrieval_score": round(top_score, 4),
        },
    )


def run_entity_check(
    check: dict[str, Any], corpus: dict[str, dict[str, Any]]
) -> tuple[bool, str, list[dict[str, Any]], dict[str, Any]]:
    terms = unique_terms([check["value"]] + check.get("contains", []))
    evidence = evidence_match(corpus, check["source_file"], 1, terms)
    passed = not evidence["missing_terms"]
    detail = f"entity={check['entity_type']}:{check['value']}; matched={len(evidence['matched_terms'])}/{len(terms)}"
    return (
        passed,
        detail,
        [public_evidence(evidence)],
        {
            "entity_true_positive": passed,
            "entity_false_negative": not passed,
        },
    )


def run_numeric_check(
    check: dict[str, Any], corpus: dict[str, dict[str, Any]]
) -> tuple[bool, str, list[dict[str, Any]], dict[str, Any]]:
    calculation = check["calculation"]
    if calculation == "threshold_breach":
        return run_threshold_breach_check(check, corpus)
    if calculation == "trend_increase":
        return run_trend_increase_check(check, corpus)
    if calculation == "stock_minimum":
        return run_stock_minimum_check(check, corpus)
    if calculation == "date_gap":
        return run_date_gap_check(check, corpus)
    raise ValueError(f"Unknown numeric calculation: {calculation}")


def run_threshold_breach_check(
    check: dict[str, Any], corpus: dict[str, dict[str, Any]]
) -> tuple[bool, str, list[dict[str, Any]], dict[str, Any]]:
    rows = csv_records(check["file"])
    asset = normalise_text(check["asset"])
    signal = normalise_text(check["signal"])
    threshold = float(check["threshold"])
    operator = check.get("operator", ">")
    values = [
        {
            "timestamp": row.get("Timestamp", ""),
            "value": as_float(row.get("Value")),
            "unit": row.get("Unit", ""),
            "state": row.get("State", ""),
        }
        for row in rows
        if normalise_text(row.get("Asset", "")) == asset
        and normalise_text(row.get("Signal", "")) == signal
    ]
    breaches = [item for item in values if compare(item["value"], operator, threshold)]
    peak = max((item["value"] for item in values), default=0.0)
    expected_count = int(check["expected_breach_count"])
    expected_peak = float(check["expected_peak"])
    passed = len(breaches) == expected_count and math.isclose(
        peak, expected_peak, rel_tol=0.0, abs_tol=0.001
    )
    evidence = [
        public_evidence(
            evidence_match(
                corpus,
                check["file"],
                1,
                check.get("evidence_terms", []),
            )
        )
    ]
    detail = (
        f"{check['asset']} {check['signal']} breaches={len(breaches)}/{expected_count}; "
        f"peak={peak}/{expected_peak} {check.get('unit', '')}"
    )
    return (
        passed,
        detail,
        evidence,
        {
            "numeric_hit": passed,
            "breach_count": len(breaches),
            "peak_value": peak,
        },
    )


def run_trend_increase_check(
    check: dict[str, Any], corpus: dict[str, dict[str, Any]]
) -> tuple[bool, str, list[dict[str, Any]], dict[str, Any]]:
    rows = csv_records(check["file"])
    asset = normalise_text(check["asset"])
    signal = normalise_text(check["signal"])
    values = [
        as_float(row.get("Value"))
        for row in sorted(rows, key=lambda item: str(item.get("Timestamp", "")))
        if normalise_text(row.get("Asset", "")) == asset
        and normalise_text(row.get("Signal", "")) == signal
    ]
    increasing = all(
        current <= next_value for current, next_value in zip(values, values[1:])
    )
    expected_delta = float(check["expected_delta_min"])
    actual_delta = round(values[-1] - values[0], 4) if len(values) >= 2 else 0.0
    passed = increasing and actual_delta >= expected_delta
    evidence = [
        public_evidence(
            evidence_match(corpus, check["file"], 1, check.get("evidence_terms", []))
        )
    ]
    detail = (
        f"points={len(values)}; increasing={increasing}; "
        f"delta={actual_delta}/{expected_delta}"
    )
    return (
        passed,
        detail,
        evidence,
        {
            "numeric_hit": passed,
            "trend_delta": actual_delta,
        },
    )


def run_stock_minimum_check(
    check: dict[str, Any], corpus: dict[str, dict[str, Any]]
) -> tuple[bool, str, list[dict[str, Any]], dict[str, Any]]:
    rows = csv_records(check["file"])
    part = normalise_text(check["part"])
    asset = normalise_text(check["asset"])
    row = next(
        (
            item
            for item in rows
            if normalise_text(item.get("Part", "")) == part
            and normalise_text(item.get("Asset", "")) == asset
        ),
        {},
    )
    available = as_float(row.get("AvailableQty"))
    minimum = as_float(row.get("MinimumQty"))
    status = str(row.get("Status", ""))
    stockout = available < minimum and status == check["expected_status"]
    evidence = [
        public_evidence(
            evidence_match(corpus, check["file"], 1, check.get("evidence_terms", []))
        )
    ]
    detail = (
        f"{check['part']} available={available}; minimum={minimum}; " f"status={status}"
    )
    return (
        stockout,
        detail,
        evidence,
        {
            "numeric_hit": stockout,
            "available_qty": available,
            "minimum_qty": minimum,
        },
    )


def run_date_gap_check(
    check: dict[str, Any], corpus: dict[str, dict[str, Any]]
) -> tuple[bool, str, list[dict[str, Any]], dict[str, Any]]:
    record = corpus[check["file"]]
    text = str(record["parsed"].get("text", ""))
    dates = [
        datetime.fromisoformat(match.group(0)).date()
        for match in re.finditer(r"\d{4}-\d{2}-\d{2}", text)
    ]
    completed_dates = [
        date
        for date in dates
        if date.isoformat() in set(check.get("completed_dates", []))
    ]
    actual_gap = (
        (completed_dates[-1] - completed_dates[-2]).days
        if len(completed_dates) >= 2
        else 0
    )
    expected_missing_date = check["expected_missing_date"]
    missing_record_noted = expected_missing_date in text and all(
        term in normalise_text(text)
        for term in map(normalise_text, check.get("gap_terms", []))
    )
    passed = actual_gap >= int(check["required_interval_days"]) and missing_record_noted
    evidence = [
        public_evidence(
            evidence_match(corpus, check["file"], 1, check.get("evidence_terms", []))
        )
    ]
    detail = (
        f"completed_gap_days={actual_gap}; "
        f"required_interval_days={check['required_interval_days']}; "
        f"missing_record_noted={missing_record_noted}"
    )
    return (
        passed,
        detail,
        evidence,
        {
            "numeric_hit": passed,
            "completed_gap_days": actual_gap,
        },
    )


def run_multi_evidence_check(
    check: dict[str, Any], corpus: dict[str, dict[str, Any]]
) -> tuple[bool, str, list[dict[str, Any]], dict[str, Any]]:
    evidence_items = [
        evidence_match(corpus, item["file"], int(item.get("page", 1)), item["contains"])
        for item in check.get("evidence", [])
    ]
    passed = all(not item["missing_terms"] for item in evidence_items)
    detail = (
        f"asset={check['asset_id']}; gap={check['gap_type']}; "
        f"evidence_hits={len([item for item in evidence_items if not item['missing_terms']])}/{len(evidence_items)}"
    )
    return (
        passed,
        detail,
        [public_evidence(item) for item in evidence_items],
        {
            "gap_hit": passed,
        },
    )


def run_contradiction_check(
    check: dict[str, Any], corpus: dict[str, dict[str, Any]]
) -> tuple[bool, str, list[dict[str, Any]], dict[str, Any]]:
    evidence_items = [
        evidence_match(corpus, item["file"], int(item.get("page", 1)), item["contains"])
        for item in check.get("evidence", [])
    ]
    combined = " ".join(item["page_text"] for item in evidence_items)
    conflict_terms = matched_terms(combined, check.get("conflict_terms", []))
    evidence_hit = all(not item["missing_terms"] for item in evidence_items)
    passed = evidence_hit and len(conflict_terms) == len(
        check.get("conflict_terms", [])
    )
    detail = (
        f"asset={check['asset_id']}; evidence_hit={evidence_hit}; "
        f"conflict_terms={len(conflict_terms)}/{len(check.get('conflict_terms', []))}"
    )
    return (
        passed,
        detail,
        [public_evidence(item) for item in evidence_items],
        {
            "contradiction_pair_hit": passed,
        },
    )


def run_rca_check(
    check: dict[str, Any], corpus: dict[str, dict[str, Any]]
) -> tuple[bool, str, list[dict[str, Any]], dict[str, Any]]:
    evidence_items = [
        evidence_match(corpus, item["file"], int(item.get("page", 1)), item["contains"])
        for item in check.get("evidence", [])
    ]
    combined = " ".join(item["page_text"] for item in evidence_items)
    cause_terms = matched_terms(combined, check.get("likely_cause_terms", []))
    check_terms = matched_terms(combined, check.get("recommended_check_terms", []))
    evidence_hit = all(not item["missing_terms"] for item in evidence_items)
    passed = (
        evidence_hit
        and len(cause_terms) == len(check.get("likely_cause_terms", []))
        and len(check_terms) == len(check.get("recommended_check_terms", []))
    )
    detail = (
        f"asset={check['asset_id']}; evidence_hit={evidence_hit}; "
        f"causes={len(cause_terms)}/{len(check.get('likely_cause_terms', []))}; "
        f"checks={len(check_terms)}/{len(check.get('recommended_check_terms', []))}"
    )
    return (
        passed,
        detail,
        [public_evidence(item) for item in evidence_items],
        {
            "rca_evidence_hit": passed,
        },
    )


def run_graph_validation_check(
    check: dict[str, Any], corpus: dict[str, dict[str, Any]]
) -> tuple[bool, str, list[dict[str, Any]], dict[str, Any]]:
    source_document = check.get("source_document", "")
    source_page = int(check.get("source_page", 1))
    evidence_text = str(check.get("evidence_text", ""))
    evidence: dict[str, Any] | None = None
    if check.get("evidence"):
        evidence_source = check["evidence"]
        evidence = evidence_match(
            corpus,
            evidence_source["file"],
            int(evidence_source.get("page", 1)),
            evidence_source.get("contains", []),
        )
        source_document = Path(evidence_source["file"]).name
        source_page = int(evidence_source.get("page", 1))
        evidence_text = evidence["snippet"]
    edge = graph_edge_record(
        check["source_node"],
        check["target_node"],
        check["relation_type"],
        float(check["confidence"]),
        source_document,
        source_page,
        evidence_text,
    )
    response = graph_edge_response(0, edge["source_id"], edge["target_id"], edge)
    passed = (
        response["validation_status"] == check["expected_status"]
        and response["relation_type"] == check["relation_type"]
        and response["confidence"] == round(float(check["confidence"]), 2)
        and (evidence is None or not evidence["missing_terms"])
    )
    detail = (
        f"{response['source_node']} -> {response['target_node']}; "
        f"status={response['validation_status']}; confidence={response['confidence']}"
    )
    return (
        passed,
        detail,
        [public_evidence(evidence)] if evidence else [],
        {
            "graph_validation_hit": passed,
            "validation_status": response["validation_status"],
        },
    )


def run_graph_check(
    check: dict[str, Any], corpus: dict[str, dict[str, Any]]
) -> tuple[bool, str, list[dict[str, Any]], dict[str, Any]]:
    evidence = evidence_match(
        corpus,
        check["evidence_file"],
        int(check.get("evidence_page", 1)),
        check.get("evidence_terms", []),
    )
    edge = graph_edge_record(
        check["source_node"],
        check["target_node"],
        check["relation_type"],
        float(check["confidence"]),
        Path(check["evidence_file"]).name,
        int(check.get("evidence_page", 1)),
        evidence["snippet"],
    )
    response = graph_edge_response(0, edge["source_id"], edge["target_id"], edge)
    passed = (
        not evidence["missing_terms"]
        and response["relation_type"] == check["relation_type"]
        and response["validation_status"] == check.get("expected_status", "accepted")
        and response.get("source_node") == check["source_node"]
        and response.get("target_node") == check["target_node"]
    )
    detail = (
        f"{response.get('source_node')} -> {response.get('target_node')}; "
        f"{response['validation_status']}; confidence={response['confidence']}"
    )
    return (
        passed,
        detail,
        [public_evidence(evidence)],
        {
            "graph_link_hit": passed,
            "validation_status": response["validation_status"],
        },
    )


def run_parser_check(
    check: dict[str, Any], corpus: dict[str, dict[str, Any]]
) -> tuple[bool, str, list[dict[str, Any]], dict[str, Any]]:
    record = corpus.get(check["file"])
    if not record:
        return False, f"File was not parsed: {check['file']}", [], {"parser_hit": False}
    parsed = record["parsed"]
    metadata = parsed.get("metadata", {})
    expected_terms = check.get("expected_terms", [])
    text = str(parsed.get("text", ""))
    missing_terms = missing_terms_in_text(text, expected_terms)
    metadata_failures = []
    for key, minimum in check.get("metadata_min", {}).items():
        value = metadata.get(key, 0)
        if float(value or 0) < float(minimum):
            metadata_failures.append(f"{key}={value} < {minimum}")
    page_count_ok = int(parsed.get("page_count", 0)) >= int(
        check.get("page_count_min", 1)
    )
    passed = (
        page_count_ok
        and not missing_terms
        and not metadata_failures
        and not record["error"]
    )
    detail = (
        f"parser={metadata.get('parser', 'unknown')}; "
        f"pages={parsed.get('page_count', 0)}; "
        f"metadata_failures={len(metadata_failures)}; "
        f"missing_terms={len(missing_terms)}"
    )
    evidence = [
        {
            "document": Path(check["file"]).name,
            "page": 1,
            "matched_terms": matched_terms(text, expected_terms),
            "missing_terms": missing_terms,
            "snippet": snippet(text),
        }
    ]
    return passed, detail, evidence, {"parser_hit": passed}


def evidence_match(
    corpus: dict[str, dict[str, Any]], source_file: str, page: int, terms: list[str]
) -> dict[str, Any]:
    record = corpus.get(source_file)
    if not record:
        return {
            "document": Path(source_file).name,
            "page": page,
            "page_text": "",
            "matched_terms": [],
            "missing_terms": terms,
            "snippet": "",
            "error": f"Source document was not parsed: {source_file}",
        }
    page_text = text_for_page(record["parsed"], page)
    return {
        "document": Path(source_file).name,
        "page": page,
        "page_text": page_text,
        "matched_terms": matched_terms(page_text, terms),
        "missing_terms": missing_terms_in_text(page_text, terms),
        "snippet": snippet(page_text, terms),
        "error": record.get("error", ""),
    }


def text_for_page(parsed: dict[str, Any], page: int) -> str:
    for item in parsed.get("pages", []):
        if int(item.get("page", 0)) == page:
            return str(item.get("text", ""))
    return ""


def public_evidence(evidence: dict[str, Any]) -> dict[str, Any]:
    return {
        "document": evidence["document"],
        "page": evidence["page"],
        "matched_terms": evidence["matched_terms"],
        "missing_terms": evidence["missing_terms"],
        "snippet": evidence["snippet"],
    }


def build_retrieval_chunks(corpus: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    chunks: list[dict[str, Any]] = []
    for relative_path, record in corpus.items():
        parsed = record["parsed"]
        for chunk in chunk_pages(parsed.get("pages", []), max_words=90, overlap=20):
            text = str(chunk.get("text", ""))
            chunks.append(
                {
                    "id": (
                        f"{relative_path}#p{int(chunk.get('page', 1))}"
                        f"#c{int(chunk.get('chunk_index', 0))}"
                    ),
                    "file": relative_path,
                    "document": Path(relative_path).name,
                    "page": int(chunk.get("page", 1)),
                    "chunk_index": int(chunk.get("chunk_index", 0)),
                    "text": text,
                    "tokens": search_tokens(text),
                }
            )
    return chunks


def retrieve_contexts(
    query: str, corpus: dict[str, dict[str, Any]], limit: int
) -> list[dict[str, Any]]:
    chunks = build_retrieval_chunks(corpus)
    if not chunks:
        return []
    query_tokens = search_tokens(query)
    query_terms = [term for term in query_tokens if term not in RETRIEVAL_STOP_WORDS]
    if not query_terms:
        query_terms = query_tokens
    idf = inverse_document_frequency(chunks)
    ranked = []
    for chunk in chunks:
        token_counts = token_count_map(chunk["tokens"])
        score = 0.0
        for term in query_terms:
            frequency = token_counts.get(term, 0)
            if frequency:
                score += (1.0 + math.log(frequency)) * idf.get(term, 1.0)
            if term in search_tokens(chunk["document"]):
                score += 0.5 * idf.get(term, 1.0)
            if is_identifier_like(term) and term in chunk["tokens"]:
                score += 2.0
        score += phrase_overlap_score(query_terms, chunk["tokens"])
        if score <= 0:
            continue
        ranked.append({**chunk, "score": round(score, 6)})
    return sorted(
        ranked,
        key=lambda item: (
            -float(item["score"]),
            item["document"],
            int(item["page"]),
            int(item["chunk_index"]),
        ),
    )[:limit]


def retrieval_metric_values(
    ranked: list[dict[str, Any]], references: list[dict[str, Any]], limit: int
) -> dict[str, Any]:
    if not references:
        return {
            "precision_at_k": 0.0,
            "context_precision": 0.0,
            "context_recall": 0.0,
            "mrr": 0.0,
            "ndcg_at_k": 0.0,
        }
    relevant_ids = {reference_context_id(item) for item in references}
    retrieved_relevant_ids: set[str] = set()
    relevant_ranks = []
    relevance_by_rank = []
    relevant_seen = 0
    precision_sum = 0.0
    for index, item in enumerate(ranked[:limit], start=1):
        is_relevant = retrieval_context_id(item) in relevant_ids
        relevance_by_rank.append(1 if is_relevant else 0)
        if is_relevant:
            retrieved_relevant_ids.add(retrieval_context_id(item))
            relevant_seen += 1
            relevant_ranks.append(index)
            precision_sum += relevant_seen / index
    ideal_relevance = [1] * min(len(relevant_ids), limit)
    return {
        "precision_at_k": ratio(len(relevant_ranks), min(limit, len(ranked))),
        "context_precision": (
            round(precision_sum / len(relevant_ranks), 4) if relevant_ranks else 0.0
        ),
        "context_recall": ratio(len(retrieved_relevant_ids), len(relevant_ids)),
        "mrr": round(1 / relevant_ranks[0], 4) if relevant_ranks else 0.0,
        "ndcg_at_k": ndcg(relevance_by_rank, ideal_relevance),
    }


def public_retrieval_evidence(
    item: dict[str, Any], references: list[dict[str, Any]]
) -> dict[str, Any]:
    relevant_ids = {reference_context_id(reference) for reference in references}
    query_terms = references_for_context(item, references)
    return {
        "document": item["document"],
        "page": item["page"],
        "matched_terms": matched_terms(item["text"], query_terms),
        "missing_terms": (
            []
            if retrieval_context_id(item) in relevant_ids
            else ["not a labelled relevant context"]
        ),
        "snippet": snippet(item["text"], query_terms),
        "score": item["score"],
    }


def references_for_context(
    item: dict[str, Any], references: list[dict[str, Any]]
) -> list[str]:
    terms: list[str] = []
    for reference in references:
        if reference_context_id(reference) == retrieval_context_id(item):
            terms.extend(reference.get("contains", []))
    return unique_terms(terms)


def reference_context_id(reference: dict[str, Any]) -> str:
    return f"{reference['file']}#p{int(reference.get('page', 1))}"


def retrieval_context_id(item: dict[str, Any]) -> str:
    return f"{item['file']}#p{int(item.get('page', 1))}"


def search_tokens(value: str) -> list[str]:
    return [match.group(0).lower() for match in TOKEN_PATTERN.finditer(str(value))]


def token_count_map(tokens: list[str]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for token in tokens:
        counts[token] = counts.get(token, 0) + 1
    return counts


def inverse_document_frequency(chunks: list[dict[str, Any]]) -> dict[str, float]:
    document_count = len(chunks)
    frequencies: dict[str, int] = {}
    for chunk in chunks:
        for token in set(chunk["tokens"]):
            frequencies[token] = frequencies.get(token, 0) + 1
    return {
        token: math.log((document_count + 1) / (frequency + 1)) + 1
        for token, frequency in frequencies.items()
    }


def phrase_overlap_score(query_terms: list[str], chunk_tokens: list[str]) -> float:
    if len(query_terms) < 2:
        return 0.0
    chunk_bigrams = set(zip(chunk_tokens, chunk_tokens[1:]))
    query_bigrams = list(zip(query_terms, query_terms[1:]))
    return 1.25 * len([bigram for bigram in query_bigrams if bigram in chunk_bigrams])


def is_identifier_like(term: str) -> bool:
    return bool(re.fullmatch(r"[a-z]{1,8}-\d+[a-z0-9-]*|\d+(?:\.\d+)?", term))


def ndcg(relevance_by_rank: list[int], ideal_relevance: list[int]) -> float:
    actual = discounted_cumulative_gain(relevance_by_rank)
    ideal = discounted_cumulative_gain(ideal_relevance)
    if ideal == 0:
        return 0.0
    return round(actual / ideal, 4)


def discounted_cumulative_gain(relevance_by_rank: list[int]) -> float:
    return sum(
        (2**relevance - 1) / math.log2(index + 2)
        for index, relevance in enumerate(relevance_by_rank)
    )


def csv_records(relative_path: str) -> list[dict[str, str]]:
    path = repo_path(relative_path)
    with path.open(newline="", encoding="utf-8-sig") as handle:
        return [dict(row) for row in csv.DictReader(handle)]


def as_float(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def compare(actual: float, operator: str, expected: float) -> bool:
    if operator == ">":
        return actual > expected
    if operator == ">=":
        return actual >= expected
    if operator == "<":
        return actual < expected
    if operator == "<=":
        return actual <= expected
    if operator == "==":
        return math.isclose(actual, expected, rel_tol=0.0, abs_tol=0.001)
    raise ValueError(f"Unsupported operator: {operator}")


def matched_terms(text: str, terms: list[str]) -> list[str]:
    haystack = normalise_text(text)
    return [term for term in terms if normalise_text(term) in haystack]


def missing_terms_in_text(text: str, terms: list[str]) -> list[str]:
    matched = set(matched_terms(text, terms))
    return [term for term in terms if term not in matched]


def unique_terms(terms: list[str]) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for term in terms:
        key = normalise_text(term)
        if key in seen:
            continue
        seen.add(key)
        result.append(term)
    return result


def normalise_text(value: str) -> str:
    return " ".join(str(value).lower().split())


def snippet(text: str, terms: list[str] | None = None, length: int = 260) -> str:
    cleaned = " ".join(str(text).split())
    if not cleaned:
        return ""
    lower = cleaned.lower()
    start = 0
    for term in terms or []:
        index = lower.find(term.lower())
        if index >= 0:
            start = max(0, index - 80)
            break
    return cleaned[start : start + length].strip()


def benchmark_metrics(
    fixture: dict[str, Any],
    checks: list[dict[str, Any]],
    elapsed_ms: float,
    parse_elapsed_ms: float,
) -> dict[str, Any]:
    category_total = category_counts(checks)
    category_passed = category_counts([check for check in checks if check["passed"]])
    qa_checks = [check for check in checks if check["category"] == "qa"]
    retrieval_checks = [check for check in checks if check["category"] == "retrieval"]
    grounding_checks = [check for check in checks if check["category"] == "grounding"]
    abstention_checks = [check for check in checks if check["category"] == "abstention"]
    entity_checks = [check for check in checks if check["category"] == "entity"]
    numeric_checks = [check for check in checks if check["category"] == "numeric"]
    compliance_checks = [check for check in checks if check["category"] == "compliance"]
    contradiction_checks = [
        check for check in checks if check["category"] == "contradiction"
    ]
    graph_checks = [check for check in checks if check["category"] == "graph"]
    graph_validation_checks = [
        check for check in checks if check["category"] == "graph_validation"
    ]
    rca_checks = [check for check in checks if check["category"] == "rca"]
    parser_checks = [check for check in checks if check["category"] == "parser"]
    observed_entities = len([check for check in entity_checks if check["passed"]])
    check_latencies = [float(check["elapsed_ms"]) for check in checks]
    return {
        "citation_hit_rate": ratio(
            len([check for check in qa_checks if check["metrics"].get("citation_hit")]),
            len(qa_checks),
        ),
        "answer_snippet_hit_rate": ratio(
            len([check for check in qa_checks if check["metrics"].get("answer_hit")]),
            len(qa_checks),
        ),
        "retrieval_context_precision": average_metric(
            retrieval_checks, "context_precision"
        ),
        "retrieval_context_recall": average_metric(retrieval_checks, "context_recall"),
        "retrieval_mrr": average_metric(retrieval_checks, "mrr"),
        "retrieval_ndcg_at_k": average_metric(retrieval_checks, "ndcg_at_k"),
        "grounded_answer_claim_f1": average_metric(grounding_checks, "answer_claim_f1"),
        "grounding_citation_coverage": average_metric(
            grounding_checks, "citation_coverage"
        ),
        "faithfulness_proxy": average_metric(grounding_checks, "faithfulness_proxy"),
        "abstention_accuracy": ratio(
            len([check for check in abstention_checks if check["passed"]]),
            len(abstention_checks),
        ),
        "entity_precision": 1.0 if observed_entities else 0.0,
        "entity_recall": ratio(observed_entities, len(entity_checks)),
        "numeric_reasoning_accuracy": ratio(
            len([check for check in numeric_checks if check["passed"]]),
            len(numeric_checks),
        ),
        "compliance_gap_accuracy": ratio(
            len([check for check in compliance_checks if check["passed"]]),
            len(compliance_checks),
        ),
        "contradiction_pair_accuracy": ratio(
            len([check for check in contradiction_checks if check["passed"]]),
            len(contradiction_checks),
        ),
        "rca_evidence_accuracy": ratio(
            len([check for check in rca_checks if check["passed"]]), len(rca_checks)
        ),
        "graph_link_completeness": ratio(
            len([check for check in graph_checks if check["passed"]]), len(graph_checks)
        ),
        "graph_validation_accuracy": ratio(
            len([check for check in graph_validation_checks if check["passed"]]),
            len(graph_validation_checks),
        ),
        "parser_contract_coverage": ratio(
            len([check for check in parser_checks if check["passed"]]),
            len(parser_checks),
        ),
        "source_document_coverage": source_document_coverage(fixture),
        "source_format_coverage": source_format_coverage(fixture),
        "source_document_count": len(fixture.get("source_documents", [])),
        "source_format_count": len(
            {Path(path).suffix.lower() for path in fixture.get("source_documents", [])}
        ),
        "benchmark_category_count": len(category_total),
        "benchmark_check_count": len(checks),
        "category_passed": category_passed,
        "category_total": category_total,
        "total_latency_ms": elapsed_ms,
        "parse_latency_ms": parse_elapsed_ms,
        "p95_check_latency_ms": percentile_95(check_latencies),
    }


def quality_gate_results(
    fixture: dict[str, Any],
    checks: list[dict[str, Any]],
    elapsed_ms: float,
    parse_elapsed_ms: float,
) -> list[dict[str, Any]]:
    gates = fixture.get("quality_gates", {})
    metrics = benchmark_metrics(fixture, checks, elapsed_ms, parse_elapsed_ms)
    gate_map = {
        "minimum_score": metrics_value(checks),
        "minimum_citation_hit_rate": metrics["citation_hit_rate"],
        "minimum_answer_snippet_hit_rate": metrics["answer_snippet_hit_rate"],
        "minimum_retrieval_context_precision": metrics["retrieval_context_precision"],
        "minimum_retrieval_context_recall": metrics["retrieval_context_recall"],
        "minimum_retrieval_mrr": metrics["retrieval_mrr"],
        "minimum_retrieval_ndcg_at_k": metrics["retrieval_ndcg_at_k"],
        "minimum_grounded_answer_claim_f1": metrics["grounded_answer_claim_f1"],
        "minimum_grounding_citation_coverage": metrics["grounding_citation_coverage"],
        "minimum_abstention_accuracy": metrics["abstention_accuracy"],
        "minimum_entity_precision": metrics["entity_precision"],
        "minimum_entity_recall": metrics["entity_recall"],
        "minimum_numeric_reasoning_accuracy": metrics["numeric_reasoning_accuracy"],
        "minimum_compliance_gap_accuracy": metrics["compliance_gap_accuracy"],
        "minimum_contradiction_pair_accuracy": metrics["contradiction_pair_accuracy"],
        "minimum_rca_evidence_accuracy": metrics["rca_evidence_accuracy"],
        "minimum_graph_link_completeness": metrics["graph_link_completeness"],
        "minimum_graph_validation_accuracy": metrics["graph_validation_accuracy"],
        "minimum_parser_contract_coverage": metrics["parser_contract_coverage"],
        "minimum_source_document_coverage": metrics["source_document_coverage"],
        "minimum_source_format_coverage": metrics["source_format_coverage"],
        "minimum_source_document_count": metrics["source_document_count"],
        "minimum_source_format_count": metrics["source_format_count"],
        "minimum_category_count": metrics["benchmark_category_count"],
        "minimum_check_count": metrics["benchmark_check_count"],
    }
    results = []
    for name, actual in gate_map.items():
        if name not in gates:
            continue
        expected = float(gates.get(name, 0))
        results.append(
            {
                "name": name,
                "expected": expected,
                "actual": actual,
                "passed": actual >= expected,
            }
        )
    for name, actual in {
        "maximum_total_latency_ms": elapsed_ms,
        "maximum_parse_latency_ms": parse_elapsed_ms,
        "maximum_p95_check_latency_ms": metrics["p95_check_latency_ms"],
    }.items():
        if name not in gates:
            continue
        expected = float(gates.get(name, float("inf")))
        results.append(
            {
                "name": name,
                "expected": expected,
                "actual": actual,
                "passed": actual <= expected,
            }
        )
    return results


def average_metric(checks: list[dict[str, Any]], metric: str) -> float:
    values = [
        float(check["metrics"][metric])
        for check in checks
        if metric in check.get("metrics", {})
    ]
    if not values:
        return 0.0
    return round(sum(values) / len(values), 4)


def source_document_coverage(fixture: dict[str, Any]) -> float:
    sample_files = supported_sample_files()
    declared = {repo_path(path) for path in fixture.get("source_documents", [])}
    return ratio(
        len([path for path in sample_files if path in declared]), len(sample_files)
    )


def source_format_coverage(fixture: dict[str, Any]) -> float:
    available_formats = {path.suffix.lower() for path in supported_sample_files()}
    declared_formats = {
        Path(path).suffix.lower() for path in fixture.get("source_documents", [])
    }
    return ratio(
        len([suffix for suffix in available_formats if suffix in declared_formats]),
        len(available_formats),
    )


def supported_sample_files() -> list[Path]:
    sample_root = REPO_ROOT / "sample_data"
    return sorted(
        path
        for path in sample_root.iterdir()
        if path.is_file() and path.suffix.lower() in SUPPORTED_SAMPLE_EXTENSIONS
    )


def metrics_value(checks: list[dict[str, Any]]) -> float:
    return ratio(len([check for check in checks if check["passed"]]), len(checks))


def category_counts(checks: list[dict[str, Any]]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for check in checks:
        counts[check["category"]] = counts.get(check["category"], 0) + 1
    return counts


def ratio(numerator: int, denominator: int) -> float:
    if denominator == 0:
        return 0.0
    return round(numerator / denominator, 4)


def f1(precision: float, recall: float) -> float:
    if precision + recall == 0:
        return 0.0
    return round((2 * precision * recall) / (precision + recall), 4)


def percentile_95(values: list[float]) -> float:
    if not values:
        return 0.0
    if len(values) == 1:
        return values[0]
    return round(statistics.quantiles(values, n=20, method="inclusive")[18], 2)


def print_metrics(metrics: dict[str, Any]) -> None:
    print(
        "Metrics: "
        f"citation_hit_rate={percent(metrics['citation_hit_rate'])}, "
        f"retrieval_recall={percent(metrics['retrieval_context_recall'])}, "
        f"grounded_claim_f1={percent(metrics['grounded_answer_claim_f1'])}, "
        f"numeric_reasoning={percent(metrics['numeric_reasoning_accuracy'])}, "
        f"entity_recall={percent(metrics['entity_recall'])}, "
        f"compliance_gap_accuracy={percent(metrics['compliance_gap_accuracy'])}, "
        f"graph_link_completeness={percent(metrics['graph_link_completeness'])}."
    )


def scorecard_markdown(result: dict[str, Any]) -> str:
    metrics = result["metrics"]
    lines = [
        "# Benchmark Scorecard",
        "",
        f"Generated: {result['generated_at']}",
        "",
        "## Method",
        "",
        "- Parses the real `sample_data/` files with the backend parser stack.",
        "- Builds a deterministic lexical retrieval baseline over parsed chunks.",
        "- Validates industrial QA, retrieval ranking, grounded claims, no-answer controls, entities, numeric logic, compliance, contradictions, RCA, graph evidence, graph validation, and parser contracts.",
        "- Does not call an LLM, seed the backend, or mutate the database in the default mode.",
        "- OCR is disabled by default for deterministic runtime; set `BENCHMARK_ENABLE_OCR=true` to include OCR.",
        "",
        "## Summary",
        "",
        f"- Score: {result['passed']}/{result['total']} ({percent(result['score'])})",
        f"- Failed: {result['failed']}",
        f"- Categories: {metrics['benchmark_category_count']}",
        f"- Source documents: {metrics['source_document_count']} across {metrics['source_format_count']} formats",
        f"- Runtime: {result['elapsed_ms']} ms",
        f"- Parse runtime: {result['parse_elapsed_ms']} ms",
        "",
        "## Quality Metrics",
        "",
        "| Metric | Value |",
        "| --- | ---: |",
        f"| Citation hit rate | {percent(metrics['citation_hit_rate'])} |",
        f"| Answer snippet hit rate | {percent(metrics['answer_snippet_hit_rate'])} |",
        f"| Retrieval context precision | {percent(metrics['retrieval_context_precision'])} |",
        f"| Retrieval context recall | {percent(metrics['retrieval_context_recall'])} |",
        f"| Retrieval MRR | {round(metrics['retrieval_mrr'], 4)} |",
        f"| Retrieval nDCG@k | {round(metrics['retrieval_ndcg_at_k'], 4)} |",
        f"| Grounded answer claim F1 | {percent(metrics['grounded_answer_claim_f1'])} |",
        f"| Grounding citation coverage | {percent(metrics['grounding_citation_coverage'])} |",
        f"| Faithfulness proxy | {percent(metrics['faithfulness_proxy'])} |",
        f"| Abstention accuracy | {percent(metrics['abstention_accuracy'])} |",
        f"| Entity extraction precision | {percent(metrics['entity_precision'])} |",
        f"| Entity extraction recall | {percent(metrics['entity_recall'])} |",
        f"| Numeric reasoning accuracy | {percent(metrics['numeric_reasoning_accuracy'])} |",
        f"| Compliance-gap accuracy | {percent(metrics['compliance_gap_accuracy'])} |",
        f"| Contradiction-pair accuracy | {percent(metrics['contradiction_pair_accuracy'])} |",
        f"| RCA evidence accuracy | {percent(metrics['rca_evidence_accuracy'])} |",
        f"| Graph-link completeness | {percent(metrics['graph_link_completeness'])} |",
        f"| Graph validation accuracy | {percent(metrics['graph_validation_accuracy'])} |",
        f"| Parser contract coverage | {percent(metrics['parser_contract_coverage'])} |",
        f"| Source document coverage | {percent(metrics['source_document_coverage'])} |",
        f"| Source format coverage | {percent(metrics['source_format_coverage'])} |",
        f"| P95 check latency | {metrics['p95_check_latency_ms']} ms |",
        "",
        "## Quality Gates",
        "",
        "| Gate | Expected | Actual | Status |",
        "| --- | ---: | ---: | --- |",
    ]
    for gate in result["quality_gates"]:
        expected = render_gate_value(gate["name"], gate["expected"])
        actual = render_gate_value(gate["name"], gate["actual"])
        status = "pass" if gate["passed"] else "fail"
        lines.append(f"| `{gate['name']}` | {expected} | {actual} | {status} |")
    lines.extend(["", "## Category Results", ""])
    for category, checks in sorted(group_by_category(result["checks"]).items()):
        passed = len([check for check in checks if check["passed"]])
        lines.extend(
            [
                f"### {category.title()}",
                "",
                f"- Passed: {passed}/{len(checks)}",
                "",
                "| Check | Type | Status | Detail | Evidence |",
                "| --- | --- | --- | --- | --- |",
            ]
        )
        for check in checks:
            status = "pass" if check["passed"] else "fail"
            detail = str(check["detail"]).replace("|", "\\|")
            evidence = render_evidence_summary(check.get("evidence", []))
            lines.append(
                f"| `{check['id']}` | `{check['type']}` | {status} | {detail} | {evidence} |"
            )
        lines.append("")
    return "\n".join(lines).strip() + "\n"


def group_by_category(checks: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    grouped: dict[str, list[dict[str, Any]]] = {}
    for check in checks:
        grouped.setdefault(check["category"], []).append(check)
    return grouped


def render_evidence_summary(evidence_items: list[dict[str, Any]]) -> str:
    if not evidence_items:
        return "No evidence"
    parts = []
    for item in evidence_items[:2]:
        missing = item.get("missing_terms", [])
        status = "matched" if not missing else f"missing {len(missing)}"
        parts.append(f"{item['document']} p{item['page']} ({status})")
    if len(evidence_items) > 2:
        parts.append(f"+{len(evidence_items) - 2} more")
    return "<br>".join(parts).replace("|", "\\|")


def render_gate_value(name: str, value: float) -> str:
    if name in {
        "minimum_source_document_count",
        "minimum_source_format_count",
        "minimum_category_count",
        "minimum_check_count",
    }:
        return str(int(round(value)))
    if name.endswith("_ms"):
        return f"{round(value, 2)} ms"
    return percent(value)


def percent(value: float) -> str:
    return f"{round(value * 100, 1)}%"


def repo_path(relative_path: str) -> Path:
    resolved = (REPO_ROOT / relative_path).resolve()
    if not resolved.is_relative_to(REPO_ROOT):
        raise ValueError(f"Path escapes repository: {relative_path}")
    return resolved


if __name__ == "__main__":
    main()
