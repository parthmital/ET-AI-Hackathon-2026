# Backend

FastAPI backend for the local Industrial Ops Brain workbench.

## Local Runtime

- Uses `DATABASE_URL` for a local Postgres database.
- Applies Alembic migrations during FastAPI startup.
- Stores uploaded files under `backend/data/uploads`.
- Indexes uploads inline through `POST /documents/upload-batch`.
- Uses FastEmbed `BAAI/bge-small-en-v1.5` embeddings stored in local Postgres pgvector columns.
- Retrieves chat and RCA context by pgvector cosine similarity before calling DeepSeek.
- Calls DeepSeek only when generated analysis or chat needs an LLM.

## Commands

From the repository root:

```powershell
npm run setup
npm run dev
npm run backend:test
```

Direct backend start:

```powershell
.\backend\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```
