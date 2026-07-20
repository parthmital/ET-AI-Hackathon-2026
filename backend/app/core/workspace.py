from __future__ import annotations

from contextlib import contextmanager
from contextvars import ContextVar, Token
from dataclasses import dataclass
from typing import Iterator


@dataclass(frozen=True)
class WorkspaceContext:
    workspace_id: str
    workspace_name: str


_workspace_context: ContextVar[WorkspaceContext | None] = ContextVar(
    "workspace_context",
    default=None,
)


def get_workspace_context() -> WorkspaceContext | None:
    return _workspace_context.get()


def set_workspace_context(context: WorkspaceContext) -> Token[WorkspaceContext | None]:
    return _workspace_context.set(context)


def reset_workspace_context(token: Token[WorkspaceContext | None]) -> None:
    _workspace_context.reset(token)


@contextmanager
def workspace_scope(context: WorkspaceContext) -> Iterator[None]:
    token = set_workspace_context(context)
    try:
        yield
    finally:
        reset_workspace_context(token)
