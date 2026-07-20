# Presentation Deck

## Slide 1: Industrial Ops Brain

An upload-driven, evidence-backed operational knowledge workspace.

## Slide 2: Problem

Operational evidence is fragmented across documents, spreadsheets, forms, and drawings. Teams need traceable answers and actions without relying on preloaded scenarios.

## Slide 3: User-controlled data lifecycle

- The workspace starts empty.
- Users upload multiple files through the application.
- Upload and generated analysis are separate actions.
- Exact duplicates are skipped.
- Users can clear the entire workspace.

## Slide 4: Evidence pipeline

- Parse embedded text, tables, and office documents.
- Apply OCR when a PDF lacks sufficient text.
- Chunk and index uploaded content.
- Extract structured records from cited filename and page evidence.
- Reject generated evidence that cannot be verified against parsed text.

## Slide 5: Operational intelligence

- Cited question answering
- Asset risk and timeline views
- Data-driven knowledge graphs
- Compliance findings and evidence packs
- Root cause analysis from user-entered symptoms

## Slide 6: Reliability controls

- Per-file atomic ingestion
- Content-hash deduplication
- Explicit manual analysis
- Atomic derived-state replacement
- Visible provider failures
- No mock, cached, seeded, or canned business outputs

## Slide 7: Demonstration

Upload every file from `sample_data/` through the multi-file UI, analyse the workspace, and choose interactions from the generated records visible on screen.

## Slide 8: Architecture

Next.js and FastAPI provide the interface and API. Local Postgres stores source records, generated records, and pgvector chunk embeddings. FastEmbed `BAAI/bge-small-en-v1.5` supports retrieval. DeepSeek performs structured extraction and cited reasoning, and NetworkX builds relationships.

## Slide 9: Current boundary

The prototype uses one shared local workspace. It is intended for offline local operation except for DeepSeek calls when generated analysis or chat is requested.

## Slide 10: Outcome

Industrial Ops Brain turns user-provided operational documents into traceable decisions while keeping every business fact tied to uploaded evidence.
