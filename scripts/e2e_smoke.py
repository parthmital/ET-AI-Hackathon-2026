from __future__ import annotations

from contextlib import ExitStack
import atexit
import os
from pathlib import Path
import re
import sys
import tempfile
from typing import Any
import uuid
import warnings

import sqlalchemy as sa

warnings.filterwarnings(
    "ignore",
    message="Using `httpx` with `starlette.testclient` is deprecated.*",
)

REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = REPO_ROOT / "backend"
SOURCE_DIR = REPO_ROOT / "sample_data"
LOCAL_TMP_DIR = REPO_ROOT / ".codex-local" / "tmp"
LOCAL_TMP_DIR.mkdir(parents=True, exist_ok=True)
sys.path.insert(0, str(BACKEND_DIR))

from app.settings import Settings  # noqa: E402

TEST_DATABASE_URL = Settings.test_database_url()
if not TEST_DATABASE_URL:
    raise RuntimeError("TEST_DATABASE_URL is required for the smoke test.")
os.environ["DATABASE_URL"] = TEST_DATABASE_URL

TEMP_WORKSPACE = tempfile.TemporaryDirectory(
    dir=LOCAL_TMP_DIR,
    ignore_cleanup_errors=True,
    prefix="smoke-",
)
RUNTIME_DIR = Path(TEMP_WORKSPACE.name)
TEST_SCHEMA = f"smoke_{uuid.uuid4().hex}"
ADMIN_ENGINE = sa.create_engine(
    TEST_DATABASE_URL,
    future=True,
    connect_args={"prepare_threshold": None},
)
with ADMIN_ENGINE.begin() as connection:
    connection.execute(sa.text(f'CREATE SCHEMA "{TEST_SCHEMA}"'))
os.environ["DATABASE_SCHEMA"] = TEST_SCHEMA
Settings.data_dir = RUNTIME_DIR
Settings.upload_dir = RUNTIME_DIR / "uploads"


def cleanup_database_schema() -> None:
    from app.services.database import Database

    Database.dispose()
    with ADMIN_ENGINE.begin() as connection:
        connection.execute(sa.text(f'DROP SCHEMA IF EXISTS "{TEST_SCHEMA}" CASCADE'))
    ADMIN_ENGINE.dispose()


atexit.register(cleanup_database_schema)

from fastapi.testclient import TestClient  # noqa: E402
from app.main import app  # noqa: E402
from app.services.parsers import SUPPORTED_EXTENSIONS  # noqa: E402

client: TestClient


def assert_ok(name: str, response: Any) -> Any:
    if response.status_code >= 400:
        raise AssertionError(
            f"{name} failed with HTTP {response.status_code}: {response.text}"
        )
    return response.json()


def assert_true(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def source_files() -> list[Path]:
    files = sorted(
        path
        for path in SOURCE_DIR.iterdir()
        if path.is_file() and path.suffix.lower() in SUPPORTED_EXTENSIONS
    )
    assert_true(bool(files), "The upload test source directory must contain documents.")
    assert_true(
        len(files) == len([path for path in SOURCE_DIR.iterdir() if path.is_file()]),
        "Every source file must use an accepted document extension.",
    )
    return files


def upload(paths: list[Path]) -> dict[str, Any]:
    with ExitStack() as stack:
        payload = [
            (
                "files",
                (
                    path.name,
                    stack.enter_context(path.open("rb")),
                    "application/octet-stream",
                ),
            )
            for path in paths
        ]
        return assert_ok(
            "POST /documents/upload-batch",
            client.post("/documents/upload-batch", files=payload),
        )


def assert_upload_only_flow(paths: list[Path]) -> None:
    result = upload(paths)
    assert_true(
        result["uploaded_count"] == len(paths),
        f"Every source file must upload. Result: {result}",
    )
    assert_true(
        result["duplicate_count"] == 0,
        f"The first upload must contain no duplicates. Result: {result}",
    )
    assert_true(
        result["failed_count"] == 0,
        f"The source batch must contain no failures. Result: {result}",
    )

    documents = assert_ok("GET /documents", client.get("/documents"))
    assert_true(len(documents) == len(paths), "Uploaded files must be listed once.")
    assert_true(
        all("parser" in document and "ocr_used" in document for document in documents),
        "Document metadata must include parser and OCR state.",
    )
    pdf_documents = [item for item in documents if item["document_type"] == "PDF"]
    assert_true(bool(pdf_documents), "The source set must exercise PDF parsing.")
    assert_true(
        any(item["ocr_used"] for item in pdf_documents),
        "At least one uploaded PDF must exercise the real OCR path.",
    )

    analysis = assert_ok("GET /analysis/status", client.get("/analysis/status"))
    assert_true(
        analysis["analysis_status"] == "not_run", "Upload must not run analysis."
    )
    assert_true(analysis["entities_extracted"] == 0, "Upload must not create entities.")
    assert_true(
        assert_ok("GET /assets", client.get("/assets")) == [],
        "Upload must not create assets.",
    )

    duplicate = upload([paths[0]])
    assert_true(
        duplicate["duplicate_count"] == 1, "Exact content must be deduplicated."
    )
    assert_true(
        len(assert_ok("GET /documents", client.get("/documents"))) == len(paths),
        "Duplicate upload must not create a document.",
    )

    with paths[0].open("rb") as handle:
        unsafe = assert_ok(
            "unsafe filename upload",
            client.post(
                "/documents/upload-batch",
                files=[
                    (
                        "files",
                        (f"../{paths[0].name}", handle, "application/octet-stream"),
                    )
                ],
            ),
        )
    assert_true(
        unsafe["items"][0]["filename"] == paths[0].name, "Filenames must be sanitised."
    )

    previous_limit = os.environ.get("MAX_UPLOAD_MB")
    os.environ["MAX_UPLOAD_MB"] = "1"
    largest = max(paths, key=lambda path: path.stat().st_size)
    try:
        too_large = upload([largest])
    finally:
        if previous_limit is None:
            os.environ.pop("MAX_UPLOAD_MB", None)
        else:
            os.environ["MAX_UPLOAD_MB"] = previous_limit
    if largest.stat().st_size > 1024 * 1024:
        assert_true(
            too_large["failed_count"] == 1, "Oversized files must fail cleanly."
        )


def assert_removed_interfaces() -> None:
    declared_paths = assert_ok("GET /openapi.json", client.get("/openapi.json"))[
        "paths"
    ]
    for path in (
        "/documents/upload",
        "/documents/ingest-local",
        "/demo/seed",
        "/evaluation/benchmark",
    ):
        assert_true(
            path not in declared_paths, f"Removed interface remains declared: {path}"
        )
    assert_true(
        not hasattr(Settings, "sample_data_dir"),
        "Backend settings must not expose source fixtures.",
    )


def assert_analysis_flow() -> None:
    analysis = assert_ok(
        "POST /analysis/regenerate", client.post("/analysis/regenerate")
    )
    if Settings.deepseek_api_key() and analysis["analysis_status"] == "complete":
        assets = assert_ok("GET /assets", client.get("/assets"))
        entities = assert_ok("GET /entities", client.get("/entities"))
        assert_true(
            bool(assets), "Live analysis must generate assets from uploaded evidence."
        )
        assert_true(
            bool(entities),
            "Live analysis must generate entities from uploaded evidence.",
        )
        selected = assets[0]
        paths = assert_ok(
            "GET /graph/paths",
            client.get(f"/graph/paths?asset_id={selected['id']}"),
        )
        assert_true(bool(paths), "Generated assets must have data-driven graph paths.")
        graph = assert_ok("GET /graph", client.get("/graph"))
        assert_true(
            graph.get("edge_audit", {}).get("total", 0) > 0,
            "Generated graph must include persisted edge audit counts.",
        )
        graph_json = assert_ok(
            "GET /graph/export json", client.get("/graph/export?format=json")
        )
        assert_true(
            "edge_audit" in graph_json["content"],
            "Graph JSON export must include edge audit evidence.",
        )
        graph_cypher = assert_ok(
            "GET /graph/export cypher", client.get("/graph/export?format=cypher")
        )
        assert_true(
            "EvidenceNode" in graph_cypher["content"],
            "Graph Cypher export must include node merge statements.",
        )
        assert_ok("GET /contradictions", client.get("/contradictions"))
        question = f"What uploaded evidence is associated with {selected['id']}?"
        chat = assert_ok(
            "POST /chat",
            client.post("/chat", json={"question": question, "filters": {}}),
        )
        assert_true(
            bool(chat["answer"] and chat["citations"]),
            "Chat must cite uploaded evidence.",
        )
    else:
        assert_true(
            analysis["analysis_status"] == "failed",
            "Unavailable analysis must fail visibly.",
        )
        assert_true(
            len(assert_ok("GET /documents", client.get("/documents")))
            == len(source_files()),
            "Analysis failure must preserve uploaded documents.",
        )
        assert_true(
            assert_ok("GET /entities", client.get("/entities")) == [],
            "Failed analysis must not create entities.",
        )
        document = assert_ok("GET /documents", client.get("/documents"))[0]
        question = f"What evidence is contained in {Path(document['filename']).stem}?"
        response = client.post("/chat", json={"question": question, "filters": {}})
        if Settings.deepseek_api_key():
            chat = assert_ok("POST /chat", response)
            assert_true(
                bool(chat["answer"] and chat["citations"]),
                "Chat must still cite uploaded evidence when a provider is configured.",
            )
        else:
            assert_true(
                response.status_code == 503,
                "Chat without a live provider must fail visibly.",
            )


def assert_no_embedded_source_facts() -> None:
    identifiers: set[str] = set()
    for path in source_files():
        if path.suffix.lower() not in {".txt", ".csv"}:
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")
        identifiers.update(re.findall(r"\b[A-Z][A-Z0-9]*-\d{2,5}\b", text))
    checked_roots = [
        BACKEND_DIR / "app",
        BACKEND_DIR / "tests",
        REPO_ROOT / "frontend",
        REPO_ROOT / "scripts",
        REPO_ROOT / "docs",
    ]
    this_file = Path(__file__).resolve()
    for root in checked_roots:
        for path in root.rglob("*"):
            if any(
                part in {"node_modules", ".next", "__pycache__"} for part in path.parts
            ):
                continue
            if (
                not path.is_file()
                or path == this_file
                or path.suffix.lower() not in {".py", ".ts", ".tsx", ".js", ".mjs"}
            ):
                continue
            content = path.read_text(encoding="utf-8", errors="ignore")
            embedded = sorted(
                identifier for identifier in identifiers if identifier in content
            )
            assert_true(
                not embedded,
                f"Uploaded source identifiers are embedded in {path}: {embedded}",
            )
    for path in (
        REPO_ROOT / "README.md",
        REPO_ROOT / "RESEARCH.md",
    ):
        if not path.exists():
            continue
        content = path.read_text(encoding="utf-8", errors="ignore")
        embedded = sorted(
            identifier for identifier in identifiers if identifier in content
        )
        assert_true(
            not embedded,
            f"Uploaded source identifiers are embedded in {path}: {embedded}",
        )


def assert_clear_workspace() -> None:
    result = assert_ok("DELETE /workspace", client.delete("/workspace"))
    assert_true(result["status"] == "cleared", "Clear must report completion.")
    assert_true(
        assert_ok("GET /documents", client.get("/documents")) == [],
        "Clear must remove documents.",
    )
    assert_true(
        assert_ok("GET /entities", client.get("/entities")) == [],
        "Clear must remove entities.",
    )
    assert_true(
        assert_ok("GET /assets", client.get("/assets")) == [],
        "Clear must remove assets.",
    )
    assert_true(
        assert_ok("GET /contradictions", client.get("/contradictions")) == [],
        "Clear must remove contradictions.",
    )
    assert_true(
        assert_ok("GET /graph", client.get("/graph"))["edges"] == [],
        "Clear must remove graph edges.",
    )
    assert_true(
        not any(Settings.upload_dir.iterdir()), "Clear must remove stored uploads."
    )


def main() -> None:
    global client
    with TestClient(app) as test_client:
        client = test_client
        paths = source_files()
        assert_removed_interfaces()
        assert_no_embedded_source_facts()
        assert_upload_only_flow(paths)
        assert_analysis_flow()
        assert_clear_workspace()
    print("End to end smoke test passed.")
    print(
        "Validated client uploads, deduplication, manual analysis, provenance, and clearing."
    )


if __name__ == "__main__":
    main()
