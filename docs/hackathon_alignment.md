# Hackathon Alignment

Source brief: [ET AI Hackathon 2026.pdf](<../ET AI Hackathon 2026.pdf>)

## Brief Summary

The brief asks teams to build an AI powered Industrial Knowledge Intelligence platform for asset intensive operations. The platform should ingest heterogeneous industrial documents, extract operational knowledge, connect it across document types, and make it available as cited answers and workflows for maintenance, compliance, quality, and engineering users.

## Challenge Mapping

| Brief requirement                        | Industrial Ops Brain implementation                                                                                                                                          |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Heterogeneous document ingestion         | Uploads PDF, DOCX, TXT, CSV, and XLSX files, then validates, parses, chunks, embeds, and stores them locally.                                                                |
| Entity extraction                        | Generated analysis extracts equipment, failure modes, spare parts, regulatory references, personnel, dates, and other allowed entity types from uploaded evidence.           |
| Knowledge graph                          | Graph edges are derived from generated records and persisted with relation type, confidence, source document, page, evidence text, validation status, and validation reason. |
| Expert copilot                           | Chat retrieves local chunks with pgvector and returns cited answers, confidence, related entities, and graph paths.                                                          |
| Maintenance and RCA                      | RCA combines asset, symptom, retrieved evidence, graph paths, contradictions, and LLM generated checks and actions.                                                          |
| Compliance intelligence                  | Compliance views show generated gaps, contradiction evidence, evidence packs, and a user query based compliance summary.                                                     |
| Lessons learned and failure intelligence | The prototype tracks failure mode entities, timeline events, contradictions, and graph links from uploaded incident, inspection, work order, and sensor records.             |
| Mobile or field use                      | The frontend is a responsive Next.js app, but no native mobile app is implemented.                                                                                           |
| Continuous update                        | New uploads can be indexed and analysed; there is no external live connector or automatic background watcher.                                                                |

## Expected Deliverables

| Deliverable from brief | Repository artefact                     | Status                                           |
| ---------------------- | --------------------------------------- | ------------------------------------------------ |
| Working prototype      | `frontend/`, `backend/`, `sample_data/` | Implemented as a local prototype.                |
| Architecture diagram   | `docs/architecture.md`                  | Provided as Mermaid plus layer notes.            |
| Presentation deck      | `docs/presentation_deck.md`             | Provided as judge slide content.                 |
| Demo video             | `docs/demo_video_script.md`             | Script provided; video capture is not committed. |

## Evaluation Focus

| Evaluation focus from brief                               | Verification evidence in repository                                                                                       |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Entity extraction accuracy across document types          | `docs/benchmark_scorecard.md` reports entity extraction precision and recall.                                             |
| Query answer quality on domain expert benchmark questions | Benchmark checks grounded answer claims, citations, no answer controls, and retrieval ranking.                            |
| Knowledge graph linkage completeness                      | Benchmark reports graph link completeness and graph validation accuracy.                                                  |
| Time to answer versus traditional search                  | Deterministic benchmark reports runtime and P95 check latency; live user time comparison is not measured.                 |
| Compliance gap detection accuracy                         | Benchmark reports compliance gap accuracy.                                                                                |
| Cross functional knowledge discovery                      | UI flows connect documents, assets, graph, compliance, RCA, contradictions, and evidence packs.                           |
| Real industrial document samples                          | The repo includes synthetic industrial sample files in `sample_data/`; no claim is made that they are real plant records. |

## Judging Criteria

| Criteria             | Weight | How the prototype addresses it                                                                                                                                         |
| -------------------- | -----: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Innovation           |    25% | Combines local document parsing, RAG, evidence validation, graph provenance, RCA, and compliance evidence packs in one workflow.                                       |
| Business Impact      |    25% | Targets time spent searching, incomplete asset history, compliance gaps, and root cause workflows from the brief.                                                      |
| Technical Excellence |    20% | Uses typed frontend contracts, FastAPI route separation, SQLAlchemy models, Alembic migrations, pgvector retrieval, deterministic benchmark checks, and backend tests. |
| Scalability          |    15% | Uses Postgres, pgvector, chunking, embeddings, and workspace scoped schema, but production scaling is not implemented.                                                 |
| User Experience      |    15% | Provides route level workflows for command centre, documents, chat, assets, graph, compliance, and RCA.                                                                |

## Demo Path

Use `docs/judge_demo_package.md` for the full sequence. The short path is:

1. Start the app with `npm run dev`.
2. Upload all files from `sample_data/`.
3. Run `Analyse workspace`.
4. Ask a cited question about P-101.
5. Inspect an asset, graph edge, compliance gap, contradiction, RCA result, and evidence pack.
6. Show `docs/benchmark_scorecard.md` for deterministic evaluation evidence.
