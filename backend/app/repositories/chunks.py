from __future__ import annotations

from app.db.database import Database


class ChunkRepository:
    insert = staticmethod(Database.insert_chunks)
    list = staticmethod(Database.list_chunks)
    missing_embeddings = staticmethod(Database.list_chunks_missing_embeddings)
    update_embeddings = staticmethod(Database.update_chunk_embeddings)
    search = staticmethod(Database.search_chunks)


chunks = ChunkRepository()
