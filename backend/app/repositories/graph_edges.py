from __future__ import annotations

from app.db.database import Database


class GraphEdgeRepository:
    replace = staticmethod(Database.replace_graph_edges)
    list = staticmethod(Database.list_graph_edges)


graph_edges = GraphEdgeRepository()
