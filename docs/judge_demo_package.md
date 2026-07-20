# Judge Demo Package

This package maps the repository to the ET AI Hackathon 2026 brief and gives judges a repeatable way to inspect the prototype.

## Brief Deliverables

| Brief deliverable    | Repository artefact                     | Demo evidence                                                                     |
| -------------------- | --------------------------------------- | --------------------------------------------------------------------------------- |
| Working prototype    | `frontend/`, `backend/`, `sample_data/` | Run `npm run dev`, upload sample data, analyse workspace, and use the app routes. |
| Architecture diagram | `docs/architecture.md`                  | Mermaid diagram and code layer explanation.                                       |
| Presentation deck    | `docs/presentation_deck.md`             | Slide by slide judge narrative.                                                   |
| Demo video           | `docs/demo_video_script.md`             | Filming script. Video status: not committed.                                      |

## Included Artefacts

- Root README: `README.md`
- Hackathon alignment: `docs/hackathon_alignment.md`
- Architecture: `docs/architecture.md`
- Presentation deck outline: `docs/presentation_deck.md`
- Demo video script: `docs/demo_video_script.md`
- Benchmark methodology: `docs/benchmark_methodology.md`
- Benchmark scorecard: `docs/benchmark_scorecard.md`
- Machine readable benchmark results: `docs/benchmark_results.json`
- Deterministic benchmark fixture: `benchmarks/industrial_ops_benchmark.json`
- Screenshot folder: `docs/screenshots/`

## Walkthrough Sequence

1. Start the app with `npm run dev`.
2. Open `http://localhost:3000`.
3. Upload all files from `sample_data/`.
4. Run `Analyse workspace`.
5. Open Documents and confirm uploaded parser metadata, page counts, OCR state, and duplicate handling.
6. Ask: `What evidence explains the P-101 seal failure?`
7. Confirm the answer cites `Incident Report Pump P-101 Seal Failure.txt`, page 1.
8. Open Assets, select `P-101`, and inspect risk, timeline, trace, contradictions, and evidence export.
9. Open Graph, select a relationship edge, and confirm relation type, confidence, validation status, source filename, page, and snippet.
10. Export graph JSON or Cypher and confirm edges include source node, relation type, target node, confidence, source document, source page, and evidence text.
11. Open Compliance and check gaps for C-204 and P-101.
12. Open RCA, select `P-101`, enter `Seal leakage after high vibration alarms`, and confirm the report cites uploaded source evidence.
13. Export an evidence pack and confirm it contains source filenames, pages, snippets, graph paths, gaps, and contradictions.
14. Clear the workspace and confirm the app returns to an empty state.

## Expected Outputs

| Flow                      | Expected evidence                                                                                                                                                    |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P-101 chat answer         | Seal leakage, bearing wear, shaft misalignment, inadequate lubrication, cited from `Incident Report Pump P-101 Seal Failure.txt`, page 1.                            |
| P-101 vibration threshold | `7 mm/s`, high vibration, bearing wear, cited from `Pump P-101 OEM Manual.txt`, page 1.                                                                              |
| C-204 compliance          | Overdue inspection and missing supervisor sign off, cited from `Factory Safety Compliance Checklist.txt`, page 1 and `Compressor C-204 Maintenance Log.txt`, page 1. |
| P-101 stockout            | Mechanical seal stockout, cited from `Spare Parts Inventory.csv`, page 1.                                                                                            |
| B-12 controls             | LOTO, Permit To Work, zero stored pressure, cited from `Boiler B-12 Safety SOP.txt`, page 1.                                                                         |
| Sensor anomaly            | P-101 vibration alarm and C-204 discharge temperature alarm, cited from `Sensor Anomaly Events.csv`, page 1.                                                         |
| P&ID sample               | `P&ID Extract Unit 1`, `P-101`, `VLV-101`, and LOTO parser evidence.                                                                                                 |
| Scanned sample            | `Scanned C-204 Inspection Form.pdf` is image backed and exercises scanned PDF parser metadata.                                                                       |

## Evaluation Focus

| Brief evaluation focus                           | Demo or benchmark evidence                                                                              |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Entity extraction accuracy across document types | `docs/benchmark_scorecard.md` reports entity extraction precision and recall.                           |
| Query answer quality                             | Chat demo plus benchmark checks for citations, grounded claims, abstention, and retrieval ranking.      |
| Knowledge graph linkage completeness             | Graph page demo plus benchmark graph link completeness and validation accuracy.                         |
| Time to answer versus traditional search         | Benchmark runtime is reported; a live traditional search comparison is not measured.                    |
| Compliance gap detection accuracy                | Compliance page demo plus benchmark compliance gap accuracy.                                            |
| Cross functional knowledge discovery             | Walkthrough moves across documents, assets, graph, compliance, RCA, contradictions, and evidence packs. |

## Benchmark Command

```powershell
npm run benchmark
```

Expected result:

- 71 deterministic checks pass across 12 benchmark categories.
- Citation hit rate, retrieval precision, retrieval recall, MRR, nDCG, grounded answer claim F1, abstention accuracy, entity precision and recall, numeric reasoning, compliance gap accuracy, contradiction pair accuracy, graph link completeness, graph validation, parser coverage, and source coverage are reported in `docs/benchmark_scorecard.md`.
- The benchmark does not call an LLM or mutate the database.

## Screenshot Command

```powershell
npm run screenshots
```

Expected script outputs under `docs/screenshots/`:

- `documents.png`
- `ask.png`
- `assets.png`
- `evidence-export.png`
- `graph.png`
- `compliance.png`
- `rca.png`
