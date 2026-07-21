# Presentation Deck

This is a judge presentation outline for the ET AI Hackathon 2026 brief.

## Slide 1: Industrial Ops Brain

AI for Industrial Knowledge Intelligence: Unified Asset and Operations Brain.

One line: a local evidence workspace that turns uploaded plant documents into cited answers, asset intelligence, graph traces, RCA, compliance review, and audit evidence packs.

## Slide 2: Problem And Challenge

Industrial teams work across disconnected document systems: drawings, work orders, procedures, inspection reports, spreadsheets, regulatory records, and email archives.

The result is slower decisions, incomplete equipment history, avoidable downtime risk, compliance gaps, and loss of experienced operator knowledge.

Industrial Ops Brain addresses the brief by making heterogeneous industrial documents queryable, actionable, and continuously updated at the point of need.

## Slide 3: Prototype Workflow

- Uploads PDF, DOCX, TXT, CSV, and XLSX files.
- Parses embedded text, tables, office documents, and sparse PDFs with OCR fallback.
- Starts from an empty workspace and keeps upload separate from generated analysis.
- Chunks and embeds local evidence.
- Extracts assets, entities, events, gaps, contradictions, and graph edges.
- Exact duplicate content is skipped.
- Users can clear the workspace.

## Slide 4: Evidence Pipeline And Provenance

- Validate file extension, MIME type, signature, size, and binary markers.
- Parse source pages.
- Store chunks and pgvector embeddings.
- Retrieve evidence by semantic similarity.
- Generate records from source evidence.
- Keep filename, page, snippet, confidence, and validation status visible.

## Slide 5: Knowledge Graph

Generated graph edges connect assets, documents, failures, controls, compliance gaps, contradictions, and events.

Each edge carries:

- Relation type.
- Confidence.
- Source document.
- Source page.
- Evidence text.
- Validation status and reason.

## Slide 6: RCA And Compliance Intelligence

RCA combines selected asset, observed symptom, retrieved evidence, graph paths, contradictions, and cited LLM output.

The output includes likely causes, supporting evidence, recommended checks, preventive actions, cited documents, and graph context.

Compliance workflow shows generated gaps, corrective actions, contradiction evidence, and evidence pack export.

This maps to the brief focus on Factory Act, OISD, PESO, environmental norms, quality standards, and audit evidence packages.

## Slide 7: Architecture

Next.js provides the local UI and API proxy. FastAPI provides backend routes. Local Postgres stores source records, generated records, and pgvector embeddings. FastEmbed creates local embeddings. DeepSeek is called only when configured. NetworkX builds graph responses.

Reference: `docs/architecture.md`.

## Slide 8: Evaluation Evidence

Deterministic benchmark:

- 71/71 checks.
- 12 categories.
- 17 source documents across 5 formats.
- 100.0% citation hit rate.
- 90.7% retrieval context precision.
- 100.0% retrieval context recall.
- 100.0% entity extraction precision and recall.
- 100.0% compliance gap accuracy.
- 100.0% graph link completeness.

Reference: `docs/benchmark_scorecard.md`.

## Slide 9: Judging Criteria Mapping

| Criteria             | Weight | Prototype evidence                                                                                                  |
| -------------------- | -----: | ------------------------------------------------------------------------------------------------------------------- |
| Innovation           |    25% | RAG, graph provenance, compliance evidence, and RCA in one local workflow.                                          |
| Business Impact      |    25% | Targets fragmented asset knowledge, downtime context, compliance gaps, and audit evidence.                          |
| Technical Excellence |    20% | Typed frontend, FastAPI, Postgres, pgvector, migrations, tests, benchmark, and validation controls.                 |
| Scalability          |    15% | Uses Postgres, pgvector, chunking, embeddings, and workspace scoped schema; production scaling remains future work. |
| User Experience      |    15% | Seven focused app routes for command centre, documents, chat, assets, graph, compliance, and RCA.                   |

## Slide 10: Demo, Boundary, And Outcome

Demo path:

1. Upload all files from `sample_data/`.
2. Analyse workspace.
3. Ask a P-101 evidence question.
4. Inspect P-101 asset intelligence.
5. Select a graph edge and export graph.
6. Review compliance gaps.
7. Generate RCA.
8. Export evidence pack.

Current boundary:

- Local prototype.
- One default workspace.
- No authentication layer.
- No production deployment files.
- No live QMS, historian, CMMS, or email connector.
- DeepSeek key required for live generated analysis and answer generation.

Industrial Ops Brain turns uploaded operational documents into traceable industrial intelligence while keeping every answer, recommendation, graph link, and compliance finding tied to source evidence.
