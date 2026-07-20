# Judge Demo Package

This package gives judges evidence without relying on seeded backend data or a prepared video.

## Included Artefacts

- Benchmark scorecard: `docs/benchmark_scorecard.md`
- Machine-readable benchmark results: `docs/benchmark_results.json`
- Deterministic benchmark fixture: `benchmarks/industrial_ops_benchmark.json`
- Screenshot set: `docs/screenshots/`
- Demo walkthrough script: `docs/demo_video_script.md`

Video status: deferred for later filming.

## Walkthrough Sequence

1. Start the app with `npm run dev`.
2. Upload all files from `sample_data/`.
3. Run `Analyse Workspace`.
4. Open Documents and confirm uploaded parser metadata, page counts, OCR state, and duplicate handling.
5. Ask: `What evidence explains the P-101 seal failure?`
6. Confirm the answer cites `Incident Report Pump P-101 Seal Failure.txt`, page 1.
7. Open Assets, select `P-101`, inspect risks, timeline, trace, contradictions, and evidence export.
8. Open Graph, select a relationship edge, and confirm relation type, confidence, validation status, source filename, page, and snippet.
9. Export graph JSON or Cypher and confirm edges include `source_node`, `relation_type`, `target_node`, `confidence`, `source_document`, `source_page`, and `evidence_text`.
10. Open Compliance and check gaps for C-204 and P-101.
11. Open RCA, select `P-101`, enter `Seal leakage after high vibration alarms`, and confirm the report cites uploaded source evidence.
12. Export an evidence pack and confirm it contains source filenames, pages, snippets, graph paths, gaps, and contradictions.

## Expected Outputs

| Flow                      | Expected Evidence                                                                                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P-101 chat answer         | Seal leakage, bearing wear, shaft misalignment, inadequate lubrication, cited from `Incident Report Pump P-101 Seal Failure.txt`, page 1                            |
| P-101 vibration threshold | `7 mm/s`, high vibration, bearing wear, cited from `Pump P-101 OEM Manual.txt`, page 1                                                                              |
| C-204 compliance          | Overdue inspection and missing supervisor sign-off, cited from `Factory Safety Compliance Checklist.txt`, page 1 and `Compressor C-204 Maintenance Log.txt`, page 1 |
| P-101 stockout            | Mechanical seal stockout, cited from `Spare Parts Inventory.csv`, page 1                                                                                            |
| B-12 controls             | LOTO, Permit To Work, zero stored pressure, cited from `Boiler B-12 Safety SOP.txt`, page 1                                                                         |
| Sensor anomaly            | P-101 vibration alarm and C-204 discharge temperature alarm, cited from `Sensor Anomaly Events.csv`, page 1                                                         |
| P&ID sample               | `P&ID Extract Unit 1`, `P-101`, `VLV-101`, and LOTO parser evidence                                                                                                 |
| Scanned sample            | `Scanned C-204 Inspection Form.pdf` is image-backed and exercises scanned PDF parser metadata                                                                       |

## Benchmark Command

```powershell
npm run benchmark
```

Expected result:

- 71 deterministic checks pass across 12 benchmark categories.
- Citation hit rate, retrieval precision/recall/MRR/nDCG, grounded answer claim F1, abstention accuracy, entity precision/recall, numeric reasoning, compliance-gap accuracy, contradiction-pair accuracy, graph-link completeness, graph validation, parser coverage, and source coverage are reported in `docs/benchmark_scorecard.md`.
- The benchmark does not call an LLM or mutate the database.

## Screenshot Command

```powershell
npm run screenshots
```

Expected result:

- `docs/screenshots/documents.png`
- `docs/screenshots/ask.png`
- `docs/screenshots/assets.png`
- `docs/screenshots/graph.png`
- `docs/screenshots/compliance.png`
- `docs/screenshots/rca.png`
- `docs/screenshots/evidence-export.png`
