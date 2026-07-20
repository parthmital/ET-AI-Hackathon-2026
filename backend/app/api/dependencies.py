from __future__ import annotations

from starlette.concurrency import run_in_threadpool

from app.core.workspace import WorkspaceContext, set_workspace_context
from app.services.database import Database


async def use_local_workspace() -> WorkspaceContext:
    context = await run_in_threadpool(Database.ensure_local_workspace)
    set_workspace_context(context)
    return context
