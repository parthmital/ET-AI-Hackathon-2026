# Industrial Ops Brain

AI for Industrial Knowledge Intelligence

Unified Asset and Operations Brain for ET AI Hackathon 2026

Industrial teams already have the evidence they need, but it is scattered across manuals, work orders, inspection reports, spreadsheets, safety procedures, sensor exports, regulatory extracts, and operator logs.

Industrial Ops Brain turns uploaded industrial files into a local evidence workspace for cited answers, asset intelligence, graph traces, root cause analysis, compliance review, and evidence packs ready for audit.

Core promise:

- Upload operational evidence.
- Analyse the workspace.
- Ask cited questions.
- Inspect asset history, graph links, compliance gaps, RCA, and exportable evidence.

## 1. Industrial teams lose time because evidence is fragmented

Maintenance, engineering, safety, quality, and operations teams often work from separate document systems.

Common sources are disconnected:

- Equipment manuals and quick guides.
- Work orders and maintenance logs.
- P&IDs, inspection forms, and scanned records.
- Historian exports and sensor anomaly tables.
- Safety SOPs, regulatory extracts, and compliance checklists.

The impact is practical:

- Slower decisions during failures.
- Incomplete asset history.
- Missed contradictions across records.
- Harder compliance preparation.
- Loss of experienced operator knowledge.

## 2. The prototype creates a local operating intelligence workspace

Industrial Ops Brain starts from user uploaded evidence and keeps every generated answer tied to source documents.

What the prototype does:

- Ingests PDF, DOCX, TXT, CSV, and XLSX files.
- Parses text, tables, office documents, and PDFs with optional OCR fallback.
- Chunks and embeds evidence locally.
- Extracts assets, entities, events, gaps, contradictions, and graph links.
- Retrieves relevant evidence before generating chat, RCA, and compliance outputs.
- Shows filename, page, snippet, confidence, and validation status wherever provenance matters.

This addresses the brief by making heterogeneous industrial knowledge queryable, connected, actionable, and updated when new files are uploaded and analysed.

## 3. The evidence pipeline is designed for traceability first

The system treats provenance as a product requirement, not a final decoration.

Ingestion controls:

- File extension, MIME type, signature, size, and binary marker validation.
- Accepted files are stored locally.
- Exact duplicate content is skipped using SHA-256.
- Generated analysis runs only after the user selects Analyse workspace.
- Per file ingestion is atomic, so one failed file does not invalidate the whole batch.
- Clearing the workspace removes local workspace records and tracked uploaded files.

Evidence pipeline:

1. Upload evidence.
2. Parse pages and tables.
3. Chunk source text.
4. Generate local FastEmbed embeddings.
5. Store chunks and vectors in Postgres with pgvector.
6. Retrieve relevant chunks for user questions and workflows.
7. Validate generated records against uploaded source filenames, pages, and snippets.

## 4. The knowledge graph turns documents into auditable relationships

The graph links asset evidence across files instead of showing documents as isolated search results.

Graph edges connect:

- Assets.
- Documents.
- Failure modes.
- Work orders.
- Spare parts.
- Historian signals.
- Regulatory references.
- Compliance gaps.
- Contradictions.
- Timeline events.

Each graph edge stores:

- Source node, relation type, and target node.
- Confidence.
- Source document and source page.
- Evidence text.
- Validation status and validation reason.

Example validated links from the sample corpus:

- P-101 to seal leakage from an incident report.
- P-101 to mechanical seal stockout from spare inventory.
- C-204 to overdue inspection from compliance and maintenance records.
- B-12 to LOTO control from a boiler safety SOP.

## 5. The judge demo shows intelligence across functions in one flow

The UI has seven focused routes:

- Command centre for workspace status.
- Documents for upload, parser metadata, page counts, and analysis.
- Chat for cited operational questions.
- Assets for risk, timeline, provenance, gaps, contradictions, and evidence export.
- Graph for node and edge inspection with source snippets.
- Compliance for gaps, contradiction evidence, summaries, and evidence packs.
- RCA for likely causes, checks, preventive actions, graph paths, and citations.

Representative demo question:

What evidence explains the P-101 seal failure?

Expected evidence pattern:

- Seal leakage from the P-101 incident report.
- High vibration context from historian and sensor data.
- Mechanical seal stockout from spare inventory.
- Relevant manual or guide guidance from P-101 maintenance documents.
- Related graph paths and citations back to source pages.

## 6. RCA and compliance workflows convert retrieval into action

The prototype is not just search. It packages evidence into operational workflows.

RCA workflow:

- Select an asset and enter an observed symptom.
- Retrieve source evidence and graph paths.
- Include contradictions when records conflict.
- Generate likely causes, supporting evidence, recommended checks, preventive actions, and cited documents.

Compliance workflow:

- Review generated gaps across the uploaded corpus.
- Inspect corrective actions and contradiction evidence.
- Ask questions focused on compliance.
- Export evidence packs with filenames, pages, snippets, graph paths, gaps, and contradictions.

Brief alignment:

- Factory Act, OISD, PESO, environmental norms, quality standards, and audit evidence packages are treated as compliance evidence domains.
- The current sample corpus exercises regulatory extracts, safety SOPs, inspection frequency, stock minimums, restart authorisation conflict, and energy isolation controls.

## 7. The architecture is simple, local, and inspectable

Runtime architecture:

- Next.js provides the local frontend and API proxy.
- FastAPI provides backend routes.
- Upload validation and parsers handle PDF, DOCX, TXT, CSV, and XLSX.
- RapidOCR is available for sparse PDFs when OCR is enabled.
- FastEmbed creates local BAAI/bge-small-en-v1.5 embeddings.
- Postgres stores source records, generated records, and pgvector embeddings.
- NetworkX builds graph responses.
- DeepSeek is called only when configured for generated analysis, chat, RCA, and compliance summaries.

Core flow:

User upload to validation to parser to chunks to embeddings to Postgres to retrieval to cited intelligence workflows.

Production boundary:

- Local prototype.
- One default workspace.
- No authentication or role based authorisation.
- No production deployment configuration.
- No live QMS, historian, CMMS, email, or document management connector.
- Generated analysis, live chat, RCA, and compliance summaries require a configured DeepSeek API key.

## 8. Deterministic evaluation shows the evidence layer is working

Benchmark generated on 20 July 2026 UTC.

The benchmark parses the sample corpus with the backend parser stack, builds deterministic retrieval checks, and validates evidence contracts without calling an LLM or mutating the database.

Headline result:

- 71 out of 71 checks passed.
- 12 benchmark categories.
- 17 synthetic source documents.
- 5 supported source formats.
- 550.81 ms total runtime.
- 496.7 ms parse runtime.
- 3.95 ms P95 check latency.

Quality metrics:

- 100.0 percent citation hit rate.
- 100.0 percent answer snippet hit rate.
- 90.7 percent retrieval context precision.
- 100.0 percent retrieval context recall.
- 100.0 percent grounded answer claim F1.
- 100.0 percent abstention accuracy.
- 100.0 percent entity extraction precision and recall.
- 100.0 percent compliance gap accuracy.
- 100.0 percent contradiction pair accuracy.
- 100.0 percent RCA evidence accuracy.
- 100.0 percent graph link completeness and graph validation accuracy.

## 9. The build maps directly to the judging criteria

| Judging criterion    |     Weight | Prototype evidence                                                                                                                                                    |
| -------------------- | ---------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Innovation           | 25 percent | Combines local document parsing, RAG, evidence validation, graph provenance, RCA, compliance review, and audit evidence packs in one workflow.                        |
| Business impact      | 25 percent | Targets fragmented asset knowledge, downtime context, compliance preparation, root cause workflows, and operator knowledge retention.                                 |
| Technical excellence | 20 percent | Uses a typed Next.js frontend, FastAPI route separation, SQLAlchemy models, Alembic migrations, pgvector retrieval, backend tests, and deterministic benchmark gates. |
| Scalability          | 15 percent | Uses Postgres, pgvector, chunking, local embeddings, and records scoped to each workspace; production scaling and live connectors remain future work.                 |
| User experience      | 15 percent | Provides focused workflows for command centre, documents, chat, assets, graph, compliance, RCA, exports, and workspace clearing.                                      |

The key trade off is deliberate: the prototype prioritises grounded local evidence and judge inspectability over production breadth.

## 10. The takeaway is traceable industrial intelligence, not generic chat

Repeatable judge demo path:

1. Start the local app.
2. Upload all 17 sample evidence files.
3. Run Analyse workspace.
4. Ask the P-101 seal failure question.
5. Inspect P-101 asset intelligence.
6. Select a graph edge and verify source evidence.
7. Review compliance gaps for C-204, P-101, and B-12.
8. Generate RCA for P-101 seal leakage after high vibration alarms.
9. Export graph and evidence packs.
10. Clear the workspace and confirm the app returns to an empty state.

Final message:

Industrial Ops Brain turns uploaded operational documents into traceable industrial intelligence while keeping every answer, recommendation, graph link, compliance finding, and RCA action tied to source evidence.
