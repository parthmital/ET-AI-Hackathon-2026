# Backend

FastAPI backend for Industrial Ops Brain.

## Purpose

The backend implements the local evidence pipeline for the ET AI Hackathon 2026 prototype:

- Validate and ingest uploaded industrial files.
- Parse PDF, DOCX, TXT, CSV, and XLSX evidence.
- Use OCR fallback for sparse PDFs when enabled.
- Chunk parsed pages and store FastEmbed vectors in Postgres with pgvector.
- Generate assets, entities, events, compliance gaps, contradictions, and graph edges after a manual analysis action.
- Serve cited chat, RCA, compliance, graph, dashboard, and evidence pack endpoints.

## Local Runtime

- Uses `DATABASE_URL` for a local Postgres database.
- Applies Alembic migrations during FastAPI startup.
- Stores uploaded files under `backend/data/uploads`.
- Stores FastEmbed cache under `backend/data/fastembed` by default.
- Uses FastEmbed `BAAI/bge-small-en-v1.5` embeddings with 384 dimensions.
- Retrieves chat and RCA context by pgvector similarity before calling DeepSeek.
- Calls DeepSeek only when generated analysis, chat, RCA, or compliance summary needs an LLM.
- Uses the default workspace id `local-workspace`.

## Commands

Run from the repository root:

```powershell
npm run setup
npm run dev
npm run backend:test
```

Direct backend start:

```powershell
cd backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Manual migration:

```powershell
cd backend
.\.venv\Scripts\python.exe -m alembic upgrade head
```

## Main API Groups

- Health: `/health`
- Dashboard: `/dashboard`
- Documents and entities: `/documents`, `/documents/upload-batch`, `/entities`
- Analysis: `/analysis/status`, `/analysis/regenerate`
- Assets: `/assets`, `/assets/{asset_id}/timeline`, `/assets/{asset_id}/risk-summary`, `/assets/{asset_id}/evidence-pack`
- Graph: `/graph`, `/graph/paths`, `/graph/export`
- Compliance: `/compliance/gaps`, `/compliance/check`, `/compliance/evidence-pack`, `/contradictions`
- RCA: `/rca`
- Workspace: `/workspace`

Full OpenAPI docs are available at `http://127.0.0.1:8000/docs` when the backend is running.
