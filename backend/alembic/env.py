from __future__ import annotations

from logging.config import fileConfig
from pathlib import Path
import sys

import sqlalchemy as sa
from alembic import context

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from app.db.models import Base
from app.core.terminal_logging import configure_terminal_logging
from app.settings import Settings

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name, disable_existing_loggers=False)
configure_terminal_logging()

target_metadata = Base.metadata


def engine_options() -> dict[str, object]:
    connect_args: dict[str, object] = {"prepare_threshold": None}
    return {
        "echo": Settings.sqlalchemy_echo(),
        "echo_pool": Settings.sqlalchemy_echo_pool(),
        "pool_pre_ping": True,
        "future": True,
        "connect_args": connect_args,
        "hide_parameters": True,
        "logging_name": "industrial_ops_brain_migrations",
        "pool_logging_name": "industrial_ops_brain_migrations_pool",
    }


def run_migrations_offline() -> None:
    context.configure(
        url=Settings.database_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    schema = Settings.database_schema()
    connectable = sa.create_engine(Settings.database_url(), **engine_options())
    with connectable.connect() as connection:
        if schema:
            connection.execute(sa.text(f'CREATE SCHEMA IF NOT EXISTS "{schema}"'))
            connection.commit()
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            version_table_schema=schema,
        )
        with context.begin_transaction():
            if schema:
                connection.execute(
                    sa.text(f'SET LOCAL search_path TO "{schema}", public')
                )
            context.run_migrations()
    connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
