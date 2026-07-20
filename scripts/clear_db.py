from __future__ import annotations

import argparse
import sys
from pathlib import Path

import sqlalchemy as sa
from sqlalchemy.engine import make_url

REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = REPO_ROOT / "backend"
sys.path.insert(0, str(BACKEND_ROOT))

from app.services.database import Database  # noqa: E402
from app.services.db_models import Base  # noqa: E402
from app.settings import Settings  # noqa: E402

LOCAL_DATABASE_HOSTS = {"localhost", "127.0.0.1", "::1"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Clear all application data tables while preserving schema, "
            "extensions, and Alembic migration history."
        )
    )
    parser.add_argument(
        "--yes",
        action="store_true",
        help="Confirm that all application database rows should be deleted.",
    )
    parser.add_argument(
        "--allow-remote",
        action="store_true",
        help="Allow clearing a non-local DATABASE_URL host.",
    )
    return parser.parse_args()


def quote_identifier(identifier: str) -> str:
    return '"' + identifier.replace('"', '""') + '"'


def database_label(database_url: str) -> str:
    return make_url(database_url).render_as_string(hide_password=True)


def is_remote_database(database_url: str) -> bool:
    host = make_url(database_url).host
    return bool(host and host not in LOCAL_DATABASE_HOSTS)


def table_names() -> tuple[str, ...]:
    return tuple(table.name for table in Base.metadata.sorted_tables)


def table_counts(connection: sa.Connection, tables: tuple[str, ...]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for table in tables:
        statement = sa.text(f"SELECT COUNT(*) FROM {quote_identifier(table)}")
        counts[table] = int(connection.execute(statement).scalar_one())
    return counts


def clear_tables(tables: tuple[str, ...]) -> tuple[dict[str, int], dict[str, int]]:
    with Database.engine().begin() as connection:
        Database._set_connection_schema(connection)
        before = table_counts(connection, tables)
        table_list = ", ".join(quote_identifier(table) for table in tables)
        connection.execute(
            sa.text(f"TRUNCATE TABLE {table_list} RESTART IDENTITY CASCADE")
        )
        after = table_counts(connection, tables)
        return before, after


def print_counts(label: str, counts: dict[str, int]) -> None:
    total = sum(counts.values())
    print(f"{label}: {total} rows")
    for table, count in counts.items():
        print(f"  {table}: {count}")


def main() -> None:
    args = parse_args()
    if not args.yes:
        raise SystemExit("Refusing to clear the database without --yes.")

    database_url = Settings.database_url()
    if is_remote_database(database_url) and not args.allow_remote:
        raise SystemExit(
            "Refusing to clear a non-local database without --allow-remote."
        )

    print(f"Database: {database_label(database_url)}")
    Database.initialise()
    tables = table_names()
    before, after = clear_tables(tables)
    print_counts("Before", before)
    print_counts("After", after)
    if any(after.values()):
        raise SystemExit("Database clear failed: rows remain after truncate.")
    print("Database cleared.")


if __name__ == "__main__":
    try:
        main()
    finally:
        Database.dispose()
