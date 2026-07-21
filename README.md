# Industrial Ops Brain

Industrial Ops Brain is a local prototype for the ET AI Hackathon 2026 challenge, "AI for Industrial Knowledge Intelligence: Unified Asset & Operations Brain".

The application ingests user uploaded industrial evidence files, indexes them locally, extracts operational records with source provenance, builds graph evidence, and supports cited chat, root cause analysis, compliance review, and evidence pack export.

Source brief: [ET AI Hackathon 2026.pdf](<ET AI Hackathon 2026.pdf>)

## Table of contents

- [Quick start](#quick-start)
- [Screenshots](#screenshots)
- [Project overview](#project-overview)
- [Hackathon alignment](#hackathon-alignment)
- [Key features](#key-features)
- [System architecture](#system-architecture)
- [Application workflow](#application-workflow)
- [Technology stack](#technology-stack)
- [Repository structure](#repository-structure)
- [Prerequisites](#prerequisites)
- [Environment configuration](#environment-configuration)
- [Database setup](#database-setup)
- [Running the application](#running-the-application)
- [Available scripts](#available-scripts)
- [API documentation](#api-documentation)
- [Validation, errors, and logging](#validation-errors-and-logging)
- [Testing and evaluation](#testing-and-evaluation)
- [Security considerations](#security-considerations)
- [Performance notes](#performance-notes)
- [Maintenance](#maintenance)
- [Troubleshooting](#troubleshooting)
- [Known limitations](#known-limitations)
- [Licence](#licence)

## Quick start

Run these commands from the repository root.

1. Create the local environment file.

```powershell
Copy-Item .env.example .env
```

This creates `.env` from the safe template. Expected result: a new `.env` file exists at the repository root. If PowerShell says the file already exists, edit the existing `.env` instead of overwriting secrets.

2. Configure local Postgres URLs in `.env`.

Set these values to local databases:

```text
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/industrial_ops_brain
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/industrial_ops_brain_test
```

Expected result: the backend can connect to local Postgres. If credentials differ, update only your local `.env`.

3. Create the local databases if they do not exist.

```powershell
createdb industrial_ops_brain
createdb industrial_ops_brain_test
```

This uses the local PostgreSQL CLI. Expected result: both databases exist. If `createdb` is not recognised, install PostgreSQL client tools or create the databases through your local database UI.

4. Install project dependencies.

```powershell
npm run setup
```

This creates or reuses `backend/.venv`, installs Python dependencies from `backend/requirements.txt`, and installs frontend dependencies under `frontend/node_modules`. Expected result: setup ends with `Setup complete.`. If it cannot create Python, install Python 3.11 and run the command again.

5. Start both local services.

```powershell
npm run dev
```

This starts FastAPI on port 8000 and Next.js on port 3000. Expected result:

- Frontend: `http://localhost:3000`
- Backend health: `http://127.0.0.1:8000/health`
- Backend OpenAPI docs: `http://127.0.0.1:8000/docs`

6. Run the demo flow.

- Open `http://localhost:3000`.
- Upload files from `sample_data/`.
- Open Documents and select `Analyse workspace`.
- Review Documents, Chat, Assets, Graph, Compliance, and RCA.

## Screenshots

### Command centre

![Command centre dashboard](docs/screenshots/command-centre.png)

### Documents

![Documents workspace](docs/screenshots/documents.png)

### Ask

![Ask workflow](docs/screenshots/ask.png)

### Assets

![Assets view](docs/screenshots/assets.png)

### Graph

![Knowledge graph view](docs/screenshots/graph.png)

### Compliance

![Compliance review](docs/screenshots/compliance.png)

### RCA

![Root cause analysis workflow](docs/screenshots/rca.png)

## Project overview

The PDF brief frames industrial knowledge fragmentation as a safety, quality, and operational efficiency problem. It asks for an AI powered platform that ingests heterogeneous industrial documents and makes the combined knowledge queryable, actionable, and continuously updated at the point of need.

This repository implements that as a local evidence workspace:

- Users upload plant documents through the UI.
- The backend validates, stores, parses, chunks, and embeds uploaded files.
- Generated analysis extracts assets, entities, timeline events, compliance gaps, contradictions, and graph edges from uploaded evidence.
- Every generated business record stores source document and page evidence where the code supports it.
- Chat, RCA, and compliance workflows retrieve local evidence before calling the configured LLM.

The only intended external runtime request is the DeepSeek chat completions API when `DEEPSEEK_API_KEY` is configured.

## Hackathon alignment

| PDF area                         | Repository implementation                                                                                                                                  | Evidence                                                                  |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Working prototype                | Local Next.js app and FastAPI backend with upload, analysis, graph, chat, compliance, and RCA flows.                                                       | `frontend/app/`, `backend/app/`                                           |
| Architecture diagram             | Mermaid architecture and code layer notes.                                                                                                                 | `docs/architecture.md`                                                    |
| Presentation deck                | Slide outline for judges.                                                                                                                                  | `docs/presentation_deck.md`                                               |
| Demo video                       | Filming script and judge walkthrough.                                                                                                                      | `docs/demo_video_script.md`, `docs/judge_demo_package.md`                 |
| Universal document ingestion     | Supports PDF, DOCX, TXT, CSV, and XLSX upload, parsing, OCR fallback for sparse PDFs, chunking, and embeddings.                                            | `backend/app/services/ingestion.py`, `backend/app/services/parsers.py`    |
| Knowledge graph                  | Persists graph edges with relation type, confidence, source document, page, evidence text, validation status, and validation reason.                       | `backend/app/services/graph/builder.py`, `backend/app/db/models.py`       |
| Expert copilot                   | RAG chat returns answers, citations, confidence, related entities, and graph paths.                                                                        | `backend/app/services/intelligence.py`, `frontend/app/chat/`              |
| Maintenance intelligence and RCA | RCA endpoint retrieves asset evidence and returns likely causes, checks, preventive actions, citations, graph paths, and contradictions.                   | `backend/app/api/rca.py`, `frontend/app/rca/`                             |
| Compliance intelligence          | Compliance gaps, checks, contradictions, and evidence packs are exposed in the API and UI.                                                                 | `backend/app/api/compliance.py`, `frontend/app/compliance/`               |
| Evaluation focus                 | Deterministic benchmark validates retrieval, citations, entity checks, compliance checks, RCA evidence, graph links, parser coverage, and source coverage. | `docs/benchmark_scorecard.md`, `benchmarks/industrial_ops_benchmark.json` |

## Key features

- Multi file upload for industrial evidence files.
- File type, MIME type, signature, size, and duplicate validation.
- PDF, DOCX, TXT, CSV, and XLSX parsing.
- Optional RapidOCR fallback for PDFs with too little embedded text.
- Local FastEmbed embeddings using `BAAI/bge-small-en-v1.5`.
- Local Postgres persistence with pgvector chunk embeddings.
- Manual analysis step for generated assets, events, gaps, contradictions, and graph edges.
- Cited chat over uploaded evidence.
- Asset risk, timeline, provenance, graph trace, and evidence pack views.
- Compliance gap review and cited compliance summaries.
- RCA generation from an asset and symptom.
- Graph export in JSON or Cypher format.
- Workspace clear action for local uploaded files and derived records.

## System architecture

```mermaid
flowchart LR
    User[User browser] --> Frontend[Next.js frontend]
    Frontend --> Proxy[Next.js backend proxy]
    Proxy --> API[FastAPI backend]
    API --> Upload[Upload validation]
    Upload --> Parse[Parsers and OCR]
    Parse --> Chunk[Page chunks]
    Chunk --> Embed[FastEmbed embeddings]
    Embed --> Store[(Postgres and pgvector)]
    API --> Analyse[Manual analysis]
    Analyse --> LLM[DeepSeek when configured]
    Analyse --> Derived[Assets, events, gaps, contradictions]
    Derived --> Graph[Graph edge builder]
    Graph --> Store
    Store --> Retrieval[Vector retrieval]
    Retrieval --> Chat[Chat, RCA, compliance]
    Chat --> LLM
    Chat --> Frontend
```

## Application workflow

1. The workspace starts empty.
2. The user uploads documents through the Documents page.
3. The backend validates each file and stores accepted files under `backend/data/uploads`.
4. Parsers extract page text and metadata. OCR is attempted for sparse PDFs when OCR is enabled.
5. Text is chunked and embedded with FastEmbed.
6. Chunks and vectors are stored in local Postgres with pgvector.
7. The user runs `Analyse workspace`.
8. DeepSeek is called only when configured, and generated records are validated against source filenames and pages.
9. The UI exposes generated evidence through the command centre, documents, chat, assets, graph, compliance, and RCA pages.
10. The user can clear the workspace, which removes stored uploads and database records for the local workspace.

## Technology stack

| Technology   | Version source                        | Purpose                                              | Where used                                         |
| ------------ | ------------------------------------- | ---------------------------------------------------- | -------------------------------------------------- |
| Node.js      | Local command reported `v24.15.0`     | Runs root scripts and frontend tooling.              | `package.json`, `scripts/`                         |
| npm          | Local command reported `11.12.1`      | Installs frontend packages and runs scripts.         | `package.json`, `frontend/package.json`            |
| Next.js      | `^16.2.9`                             | Frontend application and local backend proxy.        | `frontend/app/`, `frontend/package.json`           |
| React        | `^19.2.7`                             | UI rendering.                                        | `frontend/components/`, `frontend/app/`            |
| TypeScript   | `^6.0.3`                              | Frontend type checking.                              | `frontend/tsconfig.json`                           |
| Tailwind CSS | `^4.3.2`                              | Frontend styling.                                    | `frontend/app/globals.css`                         |
| Playwright   | `^1.61.1`                             | Frontend end to end tests and screenshot capture.    | `frontend/e2e/`, `scripts/capture-screenshots.mjs` |
| Python       | Backend venv reported `Python 3.11.9` | Backend runtime.                                     | `backend/.venv`, `backend/app/`                    |
| FastAPI      | `0.139.0`                             | HTTP API.                                            | `backend/app/main.py`, `backend/app/api/`          |
| Uvicorn      | `0.49.0`                              | Local ASGI server.                                   | `scripts/dev.mjs`                                  |
| SQLAlchemy   | `>=2.0,<3.0`                          | ORM and database access.                             | `backend/app/db/`                                  |
| Alembic      | `>=1.13,<2.0`                         | Database migrations.                                 | `backend/alembic/`                                 |
| psycopg      | `>=3.2,<4.0`                          | Postgres driver.                                     | `backend/app/db/database.py`                       |
| pgvector     | `>=0.3,<1.0`                          | Vector column support.                               | `backend/app/db/models.py`, Alembic migrations     |
| FastEmbed    | `>=0.7,<1.0`                          | Local text embeddings.                               | `backend/app/services/embeddings.py`               |
| PyMuPDF      | `1.28.0`                              | PDF text and image extraction.                       | `backend/app/services/parsers.py`                  |
| RapidOCR     | `3.9.1`                               | OCR fallback.                                        | `backend/app/services/parsers.py`                  |
| DeepSeek API | Configured by environment             | LLM extraction, chat, RCA, and compliance summaries. | `backend/app/services/llm/providers.py`            |

## Repository structure

```text
.
|-- backend/
|   |-- app/
|   |   |-- api/                  FastAPI route modules
|   |   |-- core/                 Workspace and terminal logging helpers
|   |   |-- db/                   SQLAlchemy models, sessions, and database helpers
|   |   |-- repositories/         Domain persistence wrappers
|   |   |-- services/             Ingestion, parsing, embeddings, graph, LLM, and intelligence logic
|   |   |-- main.py               FastAPI app factory
|   |   |-- settings.py           Runtime configuration
|   |   `-- types.py              Pydantic request models
|   |-- alembic/                  Database migrations
|   |-- tests/                    Backend unit and integration tests
|   |-- README.md                 Backend specific notes
|   `-- requirements.txt          Python dependencies
|-- benchmarks/
|   `-- industrial_ops_benchmark.json
|-- docs/
|   |-- architecture.md
|   |-- benchmark_methodology.md
|   |-- benchmark_scorecard.md
|   |-- demo_video_script.md
|   |-- hackathon_alignment.md
|   |-- judge_demo_package.md
|   |-- presentation_deck.md
|   `-- screenshots/
|-- frontend/
|   |-- app/                      Next.js App Router pages and API proxy
|   |-- components/               Shared UI components
|   |-- e2e/                      Playwright tests
|   |-- lib/                      API client, types, formatting, SEO, and logging utilities
|   |-- public/                   App icons
|   |-- package.json
|   `-- tsconfig.json
|-- sample_data/                  Industrial sample evidence files
|-- scripts/                      Setup, dev, smoke, benchmark, screenshot, and database helper scripts
|-- .env.example                  Safe environment template
|-- ET AI Hackathon 2026.pdf      Local challenge brief
|-- package.json                  Root orchestration scripts
`-- README.md
```

## Prerequisites

- Windows PowerShell or a compatible terminal.
- Node.js and npm. The local environment used for this README reported Node.js `v24.15.0` and npm `11.12.1`.
- Python 3.11. The backend virtual environment reported Python `3.11.9`.
- Local PostgreSQL with permission to create the `vector` extension.
- A local database matching `DATABASE_URL`.
- Optional `DEEPSEEK_API_KEY` for live generated analysis, chat, RCA, and compliance summary flows.

## Environment configuration

The backend reads `.env` from the repository root and `backend/.env`. The frontend reads public `NEXT_PUBLIC_*` variables through Next.js.

| Variable                            | Required                     | Purpose                                         | Format                                                  | Safe example                                                              | Default                          | Security notes                                           |
| ----------------------------------- | ---------------------------- | ----------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------- | -------------------------------- | -------------------------------------------------------- |
| `DATABASE_URL`                      | Yes                          | Main local Postgres database.                   | `postgresql://user:password@localhost:5432/db`          | `postgresql://postgres:postgres@localhost:5432/industrial_ops_brain`      | None                             | Keep credentials local. Do not commit `.env`.            |
| `TEST_DATABASE_URL`                 | Required for tests and smoke | Disposable local Postgres test database.        | Postgres URL                                            | `postgresql://postgres:postgres@localhost:5432/industrial_ops_brain_test` | None                             | Use a separate database because tests can mutate data.   |
| `DATABASE_SCHEMA`                   | Optional                     | Optional Postgres schema.                       | Letters, numbers, underscores, not starting with number | `industrial_ops`                                                          | Empty                            | Invalid names fail at startup.                           |
| `CORS_ORIGINS`                      | Optional                     | Allowed local browser origins.                  | Comma separated local URLs                              | `http://localhost:3000,http://127.0.0.1:3000`                             | Localhost ports 3000, 3001, 3002 | Non local origins are filtered out.                      |
| `MAX_UPLOAD_MB`                     | Optional                     | Maximum upload size per file.                   | Integer MB                                              | `25`                                                                      | `25`                             | Large values increase local storage use.                 |
| `DEBUG_ERRORS`                      | Optional                     | Include exception detail in HTTP 500 responses. | Boolean text                                            | `false`                                                                   | `false`                          | Keep false for demos.                                    |
| `LOG_LEVEL`                         | Optional                     | Python application log level.                   | `INFO`, `DEBUG`, `TRACE`                                | `INFO`                                                                    | `INFO` through dev script        | Do not use trace with sensitive real data unless needed. |
| `TERMINAL_LOG_LEVEL`                | Optional                     | Terminal logging verbosity.                     | `INFO`, `TRACE`                                         | `INFO`                                                                    | `INFO` through dev script        | Trace can emit more diagnostics.                         |
| `SQLALCHEMY_ECHO`                   | Optional                     | SQLAlchemy SQL echo.                            | Boolean or `debug`                                      | `false`                                                                   | `false`                          | SQL logs may reveal data shape.                          |
| `SQLALCHEMY_ECHO_POOL`              | Optional                     | SQLAlchemy pool echo.                           | Boolean or `debug`                                      | `false`                                                                   | `false`                          | Use only for debugging connections.                      |
| `SQLALCHEMY_LOG_LEVEL`              | Optional                     | SQLAlchemy logger level used by local tooling.  | Log level text                                          | `WARNING`                                                                 | `WARNING` through dev script     | Keep concise during demos.                               |
| `EMBEDDING_MODEL`                   | Optional                     | FastEmbed model name.                           | Model identifier                                        | `BAAI/bge-small-en-v1.5`                                                  | `BAAI/bge-small-en-v1.5`         | Changing model requires matching dimensions.             |
| `EMBEDDING_DIMENSIONS`              | Optional                     | Vector dimension.                               | Integer                                                 | `384`                                                                     | `384`                            | Code clamps this to 384.                                 |
| `EMBEDDING_BATCH_SIZE`              | Optional                     | Embedding batch size.                           | Integer 1 to 256                                        | `64`                                                                      | `64`                             | Larger values can use more memory.                       |
| `EMBEDDING_CACHE_DIR`               | Optional                     | Local model cache path.                         | Relative or absolute path                               | `backend/data/fastembed`                                                  | `backend/data/fastembed`         | This path is ignored by Git through `backend/data/`.     |
| `EMBEDDING_LOCAL_FILES_ONLY`        | Optional                     | Use only locally cached embedding files.        | Boolean text                                            | `true`                                                                    | `true`                           | Set false only when model download is acceptable.        |
| `DEEPSEEK_API_KEY`                  | Optional                     | Enables live LLM calls.                         | Secret key string                                       | `sk_example_not_a_real_key`                                               | None                             | Never commit a real key.                                 |
| `DEEPSEEK_BASE_URL`                 | Optional                     | DeepSeek API base URL.                          | HTTPS URL                                               | `https://api.deepseek.com`                                                | `https://api.deepseek.com`       | Code rejects any other host.                             |
| `DEEPSEEK_MODEL`                    | Optional                     | DeepSeek model name.                            | Model identifier                                        | `deepseek-v4-flash`                                                       | `deepseek-v4-flash`              | Must be available for the configured key.                |
| `LLM_JSON_SCHEMA`                   | Optional                     | Enable JSON schema prompt mode.                 | Boolean text                                            | `true`                                                                    | `true`                           | Keep true for structured analysis.                       |
| `LLM_MAX_ATTEMPTS`                  | Optional                     | Total LLM retry attempts.                       | Integer 1 to 10                                         | `5`                                                                       | `5`                              | More attempts can increase cost and latency.             |
| `LLM_JSON_ATTEMPTS`                 | Optional                     | JSON repair attempts.                           | Integer 1 to 4                                          | `2`                                                                       | `2`                              | Used for structured outputs.                             |
| `LLM_OUTPUT_ATTEMPTS`               | Optional                     | Output validation attempts.                     | Integer 1 to 4                                          | `2`                                                                       | `2`                              | Used for generated analysis.                             |
| `LLM_RETRY_BASE_SECONDS`            | Optional                     | Base retry delay.                               | Float 0.1 to 10.0                                       | `1.0`                                                                     | `1.0`                            | Affects failed LLM retries.                              |
| `LLM_RETRY_MAX_SECONDS`             | Optional                     | Maximum retry delay.                            | Float 1.0 to 120.0                                      | `20.0`                                                                    | `20.0`                           | Affects failed LLM retries.                              |
| `LLM_TIMEOUT_SECONDS`               | Optional                     | LLM request timeout.                            | Float 5.0 to 180.0                                      | `45.0`                                                                    | `45.0`                           | Longer timeouts make UI waits longer.                    |
| `ENABLE_OCR`                        | Optional                     | Enables OCR fallback.                           | Boolean text                                            | `true`                                                                    | `true`                           | OCR can increase local CPU time.                         |
| `OCR_ENGINE`                        | Optional                     | OCR engine label.                               | Text                                                    | `rapidocr`                                                                | `rapidocr`                       | Current parser imports RapidOCR.                         |
| `OCR_MIN_TEXT_CHARACTERS`           | Optional                     | PDF text length below which OCR is attempted.   | Integer 0 to 2000                                       | `80`                                                                      | `80`                             | Lower values reduce OCR attempts.                        |
| `NEXT_PUBLIC_API_BASE_URL`          | Optional                     | Browser API base URL.                           | Local HTTP URL                                          | `http://127.0.0.1:8000`                                                   | `http://127.0.0.1:8000`          | Non local values are rejected or replaced by defaults.   |
| `BACKEND_API_BASE_URL`              | Optional                     | Next.js server proxy backend URL.               | Local HTTP URL                                          | `http://127.0.0.1:8000`                                                   | `http://127.0.0.1:8000`          | Used by `frontend/app/api/backend/[...path]/route.ts`.   |
| `NEXT_PUBLIC_TERMINAL_BROWSER_LOGS` | Optional                     | Browser log forwarding toggle.                  | `1` or `0`                                              | `1`                                                                       | `1` through dev script           | Disable for less browser logging.                        |
| `NEXT_PUBLIC_TERMINAL_LOG_LEVEL`    | Optional                     | Browser log verbosity.                          | `info` or `trace`                                       | `info`                                                                    | `info` through dev script        | Trace is verbose.                                        |

## Database setup

The application expects local Postgres. Alembic migrations run during FastAPI startup through `Database.initialise()`.

Database facts verified from the repository:

- 5 Alembic migration files exist in `backend/alembic/versions`.
- Migrations create the `vector` extension with `CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public`.
- The latest model set has 10 ORM classes: workspace, document, chunk, entity, asset, asset document link, timeline event, compliance gap, contradiction, graph edge, and analysis run.
- Chunk embeddings use vector dimension 384.
- The default workspace id is `local-workspace`.

Manual migration command, if you need to run migrations outside `npm run dev`:

```powershell
cd backend
.\.venv\Scripts\python.exe -m alembic upgrade head
```

Expected result: all migrations are applied to the database from `DATABASE_URL`.

## Running the application

| Command                                                                                                | Where to run                  | What it does                                                  | Expected result                                        |
| ------------------------------------------------------------------------------------------------------ | ----------------------------- | ------------------------------------------------------------- | ------------------------------------------------------ |
| `npm run dev`                                                                                          | Repository root               | Installs dependencies if needed, starts backend and frontend. | Frontend on port 3000, backend on port 8000.           |
| `npm run dev:inline`                                                                                   | Repository root               | Starts both services with inline logs in one terminal.        | One terminal shows prefixed backend and frontend logs. |
| `npm run dev:verbose`                                                                                  | Repository root               | Starts both services with verbose logging.                    | More detailed terminal output.                         |
| `cd backend; .\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000` | Repository root, then backend | Starts only the backend.                                      | FastAPI runs at `http://127.0.0.1:8000`.               |
| `npm --prefix frontend run dev`                                                                        | Repository root               | Starts only the frontend.                                     | Next.js runs at `http://localhost:3000`.               |

## Available scripts

Root scripts from `package.json`:

| Script                       | Purpose                                                                                        |
| ---------------------------- | ---------------------------------------------------------------------------------------------- |
| `npm run setup`              | Create or reuse backend venv, install backend dependencies, and install frontend dependencies. |
| `npm run dev`                | Start backend and frontend.                                                                    |
| `npm run dev:inline`         | Start backend and frontend in one terminal.                                                    |
| `npm run dev:verbose`        | Start backend and frontend with verbose logs.                                                  |
| `npm run dev:inline:verbose` | Start both services inline with verbose logs.                                                  |
| `npm run frontend:typecheck` | Run TypeScript type checking.                                                                  |
| `npm run frontend:lint`      | Run ESLint for the frontend.                                                                   |
| `npm run backend:test`       | Run backend unittest discovery.                                                                |
| `npm run benchmark`          | Run deterministic benchmark against sample data and parser logic.                              |
| `npm run benchmark:verbose`  | Run benchmark with verbose environment.                                                        |
| `npm run check`              | Run frontend typecheck, frontend lint, backend tests, and benchmark.                           |
| `npm run smoke`              | Run the smoke script against `TEST_DATABASE_URL`.                                              |
| `npm run smoke:verbose`      | Run smoke script with verbose environment.                                                     |
| `npm run screenshots`        | Capture UI screenshots into `docs/screenshots/` using Playwright.                              |
| `npm run db:clear`           | Clear the configured local database through `scripts/clear_db.py`.                             |

Frontend scripts from `frontend/package.json` include `dev`, `build`, `start`, `lint`, `typecheck`, `test:e2e`, and `test:e2e:headed`.

## API documentation

Base URL: `http://127.0.0.1:8000`

Interactive OpenAPI docs: `http://127.0.0.1:8000/docs`

Authentication: none in this prototype.

| Method   | Route                              | Purpose                                                                 | Input                                   | Success response                                                           | Main errors                                                                        |
| -------- | ---------------------------------- | ----------------------------------------------------------------------- | --------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `GET`    | `/health`                          | Health, LLM, OCR, and analysis status.                                  | None                                    | Health JSON.                                                               | `500` for unhandled backend errors.                                                |
| `GET`    | `/dashboard`                       | Dashboard summary.                                                      | None                                    | Document, asset, gap, risk, upload, and failure mode counts.               | `500`.                                                                             |
| `POST`   | `/documents/upload-batch`          | Upload and index files.                                                 | `multipart/form-data` field `files`.    | Batch upload result.                                                       | `400` if no files, item level failures for invalid files, `500` for batch failure. |
| `GET`    | `/documents`                       | List uploaded documents.                                                | None                                    | Array of document summaries.                                               | `500`.                                                                             |
| `GET`    | `/documents/{document_id}`         | Get one document with chunks and entities.                              | Path `document_id`.                     | Document detail.                                                           | `404` if missing.                                                                  |
| `GET`    | `/entities`                        | List extracted entities.                                                | None                                    | Entity array.                                                              | `500`.                                                                             |
| `DELETE` | `/workspace`                       | Clear local workspace records and stored uploads.                       | None                                    | `{ "status": "cleared" }`.                                                 | `500` if clearing fails.                                                           |
| `GET`    | `/analysis/status`                 | Get latest analysis state.                                              | None                                    | Analysis status JSON.                                                      | `500`.                                                                             |
| `POST`   | `/analysis/regenerate`             | Run manual generated analysis.                                          | None                                    | Analysis status JSON.                                                      | Failed status in response if generation fails.                                     |
| `POST`   | `/chat`                            | Ask a question over uploaded evidence.                                  | JSON `question`, optional `filters`.    | Answer, citations, confidence, related entities, graph paths.              | `422` for no matched evidence, `503` for unavailable LLM.                          |
| `GET`    | `/assets`                          | List generated assets.                                                  | None                                    | Asset array.                                                               | `500`.                                                                             |
| `GET`    | `/assets/{asset_id}`               | Get one asset detail.                                                   | Path `asset_id`.                        | Asset with related documents, timeline, and risk summary.                  | `404` if missing.                                                                  |
| `GET`    | `/assets/{asset_id}/timeline`      | List asset timeline events.                                             | Path `asset_id`.                        | Timeline event array.                                                      | `500`.                                                                             |
| `GET`    | `/assets/{asset_id}/risk-summary`  | Get risk, gaps, actions, graph paths, and contradictions for one asset. | Path `asset_id`.                        | Risk summary JSON.                                                         | `404` if missing.                                                                  |
| `GET`    | `/assets/{asset_id}/evidence-pack` | Export asset evidence pack.                                             | Path `asset_id`.                        | Filename and Markdown content.                                             | `404` if missing.                                                                  |
| `GET`    | `/graph`                           | Get graph nodes, edges, and edge audit.                                 | None                                    | Graph JSON.                                                                | `500`.                                                                             |
| `GET`    | `/graph/paths`                     | Get graph evidence paths.                                               | Optional query `asset_id`.              | Graph path array.                                                          | `500`.                                                                             |
| `GET`    | `/graph/export`                    | Export graph.                                                           | Query `format=json` or `format=cypher`. | Filename, format, and content.                                             | `422` for unsupported format.                                                      |
| `GET`    | `/compliance/gaps`                 | List generated compliance gaps.                                         | None                                    | Compliance gap array.                                                      | `500`.                                                                             |
| `GET`    | `/contradictions`                  | List generated contradictions.                                          | Optional query `asset_id`.              | Contradiction array.                                                       | `500`.                                                                             |
| `GET`    | `/compliance/evidence-pack`        | Export compliance evidence pack.                                        | None                                    | Filename and Markdown content.                                             | `500`.                                                                             |
| `POST`   | `/compliance/check`                | Summarise compliance gaps for a user query.                             | JSON `query`.                           | Summary and gap array.                                                     | `422` for no stored gaps, `503` for unavailable LLM.                               |
| `POST`   | `/rca`                             | Generate RCA for an asset and symptom.                                  | JSON `asset`, `symptom`.                | Causes, evidence, checks, preventive actions, graph paths, contradictions. | `422` for no matched evidence, `503` for unavailable LLM.                          |

Request validation rules:

- `ChatRequest.question`: 1 to 800 characters.
- `RCARequest.asset`: 1 to 80 characters.
- `RCARequest.symptom`: 1 to 400 characters.
- `ComplianceRequest.query`: 1 to 500 characters.
- Upload extensions: `.pdf`, `.docx`, `.txt`, `.csv`, `.xlsx`.
- Default maximum upload size: 25 MB per file.

Example chat request:

```powershell
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8000/chat -ContentType 'application/json' -Body '{"question":"What evidence explains the P-101 seal failure?","filters":{}}'
```

Example RCA request:

```powershell
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8000/rca -ContentType 'application/json' -Body '{"asset":"P-101","symptom":"Seal leakage after high vibration alarms"}'
```

Example graph export:

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/graph/export?format=json'
```

## Validation, errors, and logging

Input validation:

- Upload filenames are sanitised and limited to 160 characters.
- Upload content is checked by extension, MIME type, file signature, size, and binary markers.
- DOCX and XLSX files must be valid ZIP containers with expected internal paths.
- PDF files must start with the `%PDF-` signature.
- Exact file duplicates are detected by SHA-256 content hash.
- Pydantic validates JSON request length limits.

Error handling:

- Validation problems from user inputs usually return `422`.
- Missing document or asset routes return `404`.
- LLM configuration or runtime failures return `503` with a public message.
- Unhandled backend errors return `500`.
- Batch uploads keep per file status, so one failed file does not fail the whole batch response unless the route itself fails.

Logging:

- Backend request logging is installed in `backend/app/main.py`.
- Default logs are concise.
- Trace logs include more diagnostics and sanitised payload summaries.
- Browser log forwarding is controlled by `NEXT_PUBLIC_TERMINAL_BROWSER_LOGS` and `NEXT_PUBLIC_TERMINAL_LOG_LEVEL`.

## Testing and evaluation

Verified repository metrics:

| Metric                         | Verified value | Source                                |
| ------------------------------ | -------------- | ------------------------------------- |
| Backend endpoints              | 23             | `rg -n "@router\\.(get                | post                       | delete | put | patch)" backend/app/api` |
| Frontend app routes            | 7              | `frontend/app/**/page.tsx`            |
| Sample evidence files          | 17             | `rg --files sample_data`              |
| Supported source formats       | 5              | `backend/app/services/parsers.py`     |
| Backend test files             | 5              | `rg --files backend/tests`            |
| Backend test cases             | 31             | `rg -n "^ def test_                   | ^def test_" backend/tests` |
| Alembic migrations             | 5              | `rg --files backend/alembic/versions` |
| Deterministic benchmark checks | 71             | `docs/benchmark_scorecard.md`         |
| Benchmark categories           | 12             | `docs/benchmark_scorecard.md`         |

Main verification commands:

```powershell
npm run frontend:typecheck
npm run frontend:lint
npm run backend:test
npm run benchmark
```

All in one:

```powershell
npm run check
```

End to end test command:

```powershell
npm --prefix frontend run test:e2e
```

The deterministic benchmark reported these values in `docs/benchmark_scorecard.md`:

- Score: 71/71.
- Citation hit rate: 100.0%.
- Retrieval context precision: 90.7%.
- Retrieval context recall: 100.0%.
- Grounded answer claim F1: 100.0%.
- Entity extraction precision and recall: 100.0%.
- Compliance gap accuracy: 100.0%.
- Graph link completeness: 100.0%.
- Parser contract coverage: 100.0%.
- Source document coverage: 100.0%.

## Security considerations

- `.env`, `.env.*`, local caches, local data, and virtual environments are ignored by Git.
- Real API keys must stay only in local `.env`.
- The backend accepts only local CORS origins.
- The frontend backend proxy accepts only local backend URLs.
- `DEEPSEEK_BASE_URL` is restricted to `https://api.deepseek.com`.
- Upload validation rejects unsupported extensions, invalid MIME types, invalid signatures, empty files, oversized files, and binary text uploads.
- No authentication or authorisation layer is implemented.
- This prototype should not be exposed directly to the public internet.

## Performance notes

Measured by the deterministic benchmark in `docs/benchmark_scorecard.md`:

- Runtime: 550.81 ms.
- Parse runtime: 496.7 ms.
- P95 check latency: 3.95 ms.

Not measured in the current repository.

- Live LLM latency.
- Frontend bundle size.
- Production load capacity.
- Multi user concurrency.

## Maintenance

- Uploaded files are stored under `backend/data/uploads`.
- FastEmbed cache defaults to `backend/data/fastembed`.
- Local generated data under `backend/data/` is ignored by Git.
- Alembic migrations are applied on backend startup.
- Use the UI Clear workspace action or `DELETE /workspace` to remove local workspace records and tracked upload files.
- Use `npm run db:clear` only for a local database you are willing to clear.
- Keep sample data in `sample_data/` because benchmark and demo documentation refer to it.

## Troubleshooting

| Problem                                                | Likely cause                                                         | Diagnostic command                                                         | Resolution                                                                 |
| ------------------------------------------------------ | -------------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `DATABASE_URL is required`                             | `.env` is missing or does not define `DATABASE_URL`.                 | `Get-Content .env`                                                         | Create `.env` from `.env.example` and set a local Postgres URL.            |
| Backend cannot connect to Postgres                     | Database is not running or credentials are wrong.                    | `psql "$env:DATABASE_URL" -c "SELECT 1"`                                   | Start Postgres and correct `.env`.                                         |
| `vector` extension error                               | Database user cannot create extensions or pgvector is not installed. | `psql -d industrial_ops_brain -c "CREATE EXTENSION IF NOT EXISTS vector;"` | Install pgvector locally or use a database role with extension permission. |
| Port 8000 or 3000 is already in use                    | Another backend or frontend is running.                              | `netstat -ano                                                              | findstr ":8000"`                                                           | Stop the conflicting process or close the old dev server. |
| Upload is rejected as unsupported                      | File extension, MIME type, signature, size, or binary check failed.  | Check the upload response item message.                                    | Use PDF, DOCX, TXT, CSV, or XLSX files under the configured size limit.    |
| Chat, RCA, or compliance check returns LLM unavailable | `DEEPSEEK_API_KEY` is missing or the provider failed.                | Open `http://127.0.0.1:8000/health`                                        | Set a valid key in `.env` or use non LLM flows only.                       |
| OCR says unavailable                                   | RapidOCR import failed or OCR dependencies are missing.              | Open `/health` and inspect `ocr`.                                          | Run `npm run setup` again and verify backend dependencies installed.       |
| Benchmark script cannot find backend venv              | Setup was not run.                                                   | `Test-Path backend\.venv\Scripts\python.exe`                               | Run `npm run setup`.                                                       |

## Known limitations

- The app is a local prototype with one default workspace, `local-workspace`.
- There is no authentication or role based authorisation.
- There is no live external QMS, historian, email archive, or CMMS integration.
- Generated analysis and live answers require a configured DeepSeek API key.
- The benchmark is deterministic and does not grade live LLM output.
- Production deployment files are not present.
- Demo video content is documented as a script, not committed as a video file.

## Licence

No licence file is present in the current repository.
