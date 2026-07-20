from __future__ import annotations

from app.db.database import Database


class VectorSearchRepository:
    search_chunks = staticmethod(Database.search_chunks)
    missing_embeddings = staticmethod(Database.list_chunks_missing_embeddings)
    update_embeddings = staticmethod(Database.update_chunk_embeddings)


vector_search = VectorSearchRepository()
