from __future__ import annotations

from app.db.database import Database


class WorkspaceRepository:
    clear = staticmethod(Database.clear_workspace)


workspace = WorkspaceRepository()
