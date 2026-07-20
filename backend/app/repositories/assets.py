from __future__ import annotations

from app.db.database import Database


class AssetRepository:
    list = staticmethod(Database.list_assets)
    get = staticmethod(Database.get_asset)


assets = AssetRepository()
