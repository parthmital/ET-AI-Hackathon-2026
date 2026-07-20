# Demo Video Script

Status: script ready. Video capture is not committed.

Use this with `docs/judge_demo_package.md`.

## Goal

Show Industrial Ops Brain as a working prototype for the ET AI Hackathon 2026 brief: an industrial knowledge intelligence workspace that ingests heterogeneous documents and turns them into cited answers, graph evidence, maintenance intelligence, RCA, and compliance review.

## Opening

Introduce the project:

- Name: Industrial Ops Brain.
- Brief theme: Industrial Intelligence, Document Management, Knowledge Engineering, Quality.
- Problem: industrial teams lose time and context because asset evidence is spread across drawings, manuals, work orders, inspection reports, spreadsheets, and safety documents.
- Promise: upload plant evidence, analyse it, and inspect every generated answer or action with source citations.

Show that the dashboard begins empty and requires user provided files.

## Upload And Ingestion

1. Open Documents.
2. Select all files from `sample_data/` using the multi file picker.
3. Show the staged queue before uploading.
4. Upload the batch.
5. Point out per file statuses, parser metadata, page counts, OCR state, and duplicate protection.
6. Re select one uploaded file and show the duplicate result.

Judging link: heterogeneous document ingestion and source coverage.

## Manual Analysis

1. Confirm that assets and generated records are empty immediately after upload.
2. Select `Analyse workspace`.
3. Show generated assets, entities, events, risks, gaps, contradictions, and graph edge audit counts after analysis completes.
4. Open a generated record and show its uploaded filename and page provenance.

Judging link: entity extraction accuracy, generated evidence, and technical excellence.

## Expert Knowledge Copilot

1. Open Chat.
2. Ask: `What evidence explains the P-101 seal failure?`
3. Show answer, citations, confidence, related entities, and graph paths.
4. Confirm the answer cites uploaded evidence instead of canned text.

Judging link: query answer quality and time to answer.

## Asset And Maintenance Intelligence

1. Open Assets.
2. Select `P-101` from generated assets.
3. Review risk level, last inspection, suggested actions, timeline, gaps, contradictions, and provenance.
4. Export the asset evidence pack.

Judging link: maintenance intelligence, asset history, and cross functional discovery.

## Knowledge Graph

1. Open Graph.
2. Select a node and then an edge.
3. Show relation type, confidence, validation status, source document, source page, and evidence text.
4. Export JSON or Cypher.

Judging link: knowledge graph linkage completeness and provenance.

## Compliance Intelligence

1. Open Compliance.
2. Review generated gaps.
3. Run a compliance query.
4. Show the compliance evidence pack.

Judging link: compliance gap detection accuracy and audit evidence.

## RCA Workflow

1. Open RCA.
2. Select `P-101`.
3. Enter `Seal leakage after high vibration alarms`.
4. Generate RCA.
5. Show likely causes, supporting evidence, recommended checks, preventive actions, graph paths, and contradictions.

Judging link: maintenance intelligence and RCA support.

## Verification Artefacts

Show:

- `docs/benchmark_scorecard.md`
- `docs/hackathon_alignment.md`
- `docs/architecture.md`
- `docs/judge_demo_package.md`
- `docs/screenshots/`

## Close

Show `Clear workspace`, confirm the destructive action, and return to the empty state.

Final message: Industrial Ops Brain turns user provided operational documents into traceable industrial intelligence while keeping every business fact tied to uploaded evidence.
