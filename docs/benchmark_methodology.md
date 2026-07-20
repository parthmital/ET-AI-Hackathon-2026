# Benchmark Methodology

Generated artefacts:

- `docs/benchmark_scorecard.md`
- `docs/benchmark_results.json`
- `benchmarks/industrial_ops_benchmark.json`

## Benchmark Shape

The local benchmark stays deterministic and CI-friendly. It does not call an LLM, seed the backend, or mutate the database. Instead, it validates the evidence substrate that the app depends on:

- Complete source coverage across all 17 files in `sample_data/`.
- Format coverage across text, CSV, XLSX, DOCX, and PDF.
- Parser contracts for tables, PDFs, image-backed scanned PDFs, DOCX, CSV, and text.
- Offline lexical retrieval over backend chunks with context precision, context recall, MRR, and nDCG.
- Grounded answer claim coverage, citation coverage, and a deterministic faithfulness proxy.
- No-answer controls for unsupported assets, dates, and equipment.
- Domain logic checks for vibration thresholds, trend deltas, stock minimums, and inspection date gaps.
- Compliance, contradiction, RCA, graph edge, and graph validation checks.

## Current Gates

The fixture requires:

- 12 benchmark categories.
- At least 65 checks.
- 100% deterministic pass rate for labelled QA, grounding, abstention, entity, numeric, compliance, contradiction, RCA, graph, graph validation, parser, document coverage, and format coverage.
- Retrieval aggregate gates of at least 75% context recall, 45% context precision, 45% MRR, and 70% nDCG@k.
- Runtime gates of 10 seconds total, 7 seconds parse time, and 25 ms P95 per-check latency in default OCR-disabled mode.

## Known Limits

This is not a live LLM quality benchmark. It validates whether the corpus, parsers, deterministic retrieval baseline, evidence labels, and domain logic are strong enough to support a live judged evaluation. A future live benchmark should seed an isolated test database, run the real `/chat`, `/rca`, and `/compliance/check` endpoints, and compare model outputs against the same grounded claims with a calibrated grader.
