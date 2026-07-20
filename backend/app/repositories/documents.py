from __future__ import annotations

from typing import Any

from app.db.database import Database


class DocumentRepository:
    find_by_hash = staticmethod(Database.find_document_by_hash)
    insert = staticmethod(Database.insert_document)
    insert_ingested = staticmethod(Database.insert_ingested_document)
    delete = staticmethod(Database.delete_document)
    list = staticmethod(Database.list_documents)
    get = staticmethod(Database.get_document)
    list_entities = staticmethod(Database.list_entities)


documents = DocumentRepository()
