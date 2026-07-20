from __future__ import annotations

from fastapi import APIRouter
from fastapi import Depends

from app.api import (
    analysis,
    assets,
    chat,
    compliance,
    dashboard,
    documents,
    graph,
    health,
    rca,
    workspace,
)
from app.api.dependencies import use_local_workspace

api_router = APIRouter()
api_router.include_router(health.router)
local_workspace_router = APIRouter(dependencies=[Depends(use_local_workspace)])
local_workspace_router.include_router(dashboard.router)
local_workspace_router.include_router(documents.router)
local_workspace_router.include_router(workspace.router)
local_workspace_router.include_router(graph.router)
local_workspace_router.include_router(chat.router)
local_workspace_router.include_router(assets.router)
local_workspace_router.include_router(rca.router)
local_workspace_router.include_router(compliance.router)
local_workspace_router.include_router(analysis.router)
api_router.include_router(local_workspace_router)
