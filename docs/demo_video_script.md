# Demo Video Script

Status: script ready; video capture is deferred for later filming.

Use this together with `docs/judge_demo_package.md`.

## Opening

Introduce Industrial Ops Brain as an upload-driven operational evidence workspace. Show that the dashboard begins empty and that the application requires user-provided files.

## Upload

1. Open Documents.
2. Select all files from `sample_data/` using the multi-file picker.
3. Show the staged queue before uploading.
4. Upload the batch and point out per-file statuses, parser metadata, OCR state, and duplicate protection.
5. Re-select one uploaded file and show the duplicate result.

## Manual analysis

1. Confirm that assets and entities remain empty immediately after upload.
2. Select `Analyse workspace`.
3. Show generated assets, entities, events, risks, gaps, contradictions, and graph edge audit counts after analysis completes.
4. Open a generated record and show its uploaded filename and page provenance.

## Intelligence workflow

1. Select a generated asset rather than typing a prepared identifier.
2. Use the redesigned Assets page rail, workspace modes, and inspector to review overview, timeline, gaps, trace, provenance, and evidence pack export.
3. Ask a question based on visible uploaded evidence and show citations.
4. Inspect the graph path, select an edge, and export JSON or Cypher.
5. Enter a compliance request and show evidence-backed gaps.
6. Select an analysed asset, enter an observed symptom, and run RCA.

## Verification artefacts

1. Show `docs/benchmark_scorecard.md`.
2. Show the generated screenshots under `docs/screenshots/`.
3. Show `docs/judge_demo_package.md` for expected outputs and benchmark notes.

## Close

Show `Clear workspace`, confirm the destructive action, and return to the empty state. Reinforce that the application contains no server-side seed path or canned business output.
