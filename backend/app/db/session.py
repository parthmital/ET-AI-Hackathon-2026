from __future__ import annotations

from contextlib import contextmanager
from typing import Iterator

from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from app.db.database import Database


def engine() -> Engine:
    return Database.engine()


@contextmanager
def session() -> Iterator[Session]:
    with Database.session() as database_session:
        yield database_session


def initialise() -> None:
    Database.initialise()


def dispose() -> None:
    Database.dispose()
