from __future__ import annotations

import hashlib
import io
import logging
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import uuid

import sqlalchemy as sa

from app.services.analysis import (
    clean_string_list,
    clean_text,
    evidence_supported,
    generate_structured_analysis,
    normalise_analysis_payload,
    normalise_asset_id,
)
from app.services.database import Database
from app.services.embeddings import LocalEmbeddingConfig, LocalFastEmbedProvider
from app.services.ingestion import safe_filename
from app.services.intelligence import string_list
from app.services.llm import (
    DeepSeekProvider,
    ProviderConfig,
    public_message_for_status,
)
from app.services.terminal_logging import (
    DEFAULT_LOG_LEVEL,
    TRACE_LEVEL,
    _log_level,
    log_blob,
    summarise_for_log,
)
from app.services.parsers import SUPPORTED_EXTENSIONS, parse_document
from app.settings import Settings

REPO_ROOT = Path(__file__).resolve().parents[2]
SOURCE_DIR = REPO_ROOT / "sample_data"


def source_files() -> list[Path]:
    return sorted(
        path
        for path in SOURCE_DIR.iterdir()
        if path.is_file() and path.suffix.lower() in SUPPORTED_EXTENSIONS
    )


class LLMProviderConfigurationTest(unittest.TestCase):
    def test_deepseek_is_only_configured_provider(self) -> None:
        with patch.dict(
            "os.environ",
            {
                "DEEPSEEK_API_KEY": "deepseek-key",
                "DEEPSEEK_THINKING": "enabled",
            },
        ):
            active = Settings.active_llm_provider_config()
            self.assertIsNotNone(active)
            assert active is not None
            self.assertEqual(active["name"], "deepseek")
            self.assertEqual(active["base_url"], "https://api.deepseek.com")
            self.assertEqual(active["model"], "deepseek-v4-flash")
            self.assertEqual(active["thinking_type"], "disabled")

    def test_deepseek_completion_disables_thinking(self) -> None:
        class FakeResponse:
            status_code = 200
            text = '{"choices":[{"message":{"content":"ok"}}]}'
            headers: dict[str, str] = {}

            def json(self) -> dict[str, object]:
                return {"choices": [{"message": {"content": "ok"}}]}

        provider = DeepSeekProvider(
            ProviderConfig(
                name="deepseek",
                api_key="deepseek-key",
                base_url="https://api.deepseek.com",
                model="deepseek-v4-flash",
            )
        )
        with patch("app.services.llm.httpx.post", return_value=FakeResponse()) as post:
            self.assertEqual(provider.complete_text("system", "user"), "ok")

        body = post.call_args.kwargs["json"]
        self.assertEqual(body["model"], "deepseek-v4-flash")
        self.assertEqual(body["thinking"], {"type": "disabled"})
        self.assertNotIn("max_tokens", body)
        self.assertNotIn("max_completion_tokens", body)
        self.assertNotIn("reasoning_effort", body)

    def test_deepseek_json_uses_documented_json_object_mode(self) -> None:
        provider = DeepSeekProvider(
            ProviderConfig(
                name="deepseek",
                api_key="deepseek-key",
                base_url="https://api.deepseek.com",
                model="deepseek-v4-flash",
            )
        )
        with patch.object(
            provider,
            "_completion_text",
            return_value='{"ok": true}',
        ) as completion:
            self.assertEqual(
                provider.complete_json(
                    "Return json.",
                    "Return ok.",
                    schema={"type": "object"},
                ),
                {"ok": True},
            )
        self.assertEqual(
            completion.call_args.kwargs["response_format"], {"type": "json_object"}
        )

    def test_provider_balance_error_is_visible(self) -> None:
        self.assertIn("insufficient balance", public_message_for_status(402, False))

    def test_generated_text_cleaning_does_not_truncate(self) -> None:
        long_text = " ".join(["segment"] * 400)
        self.assertEqual(clean_text(long_text), long_text)
        self.assertEqual(clean_string_list([long_text]), [long_text])
        self.assertEqual(string_list([long_text], "items"), [long_text])

    def test_evidence_matching_accepts_supported_summary_text(self) -> None:
        source = (
            "2030-03-12 WO-9998 lubrication completed. " "Supervisor sign-off: present."
        )

        self.assertTrue(
            evidence_supported(
                "WO-9998 lubrication completed on 2030-03-12",
                source,
            )
        )
        self.assertTrue(evidence_supported("Supervisor sign off present", source))
        self.assertFalse(
            evidence_supported(
                "WO-9997 lubrication completed on 2030-03-12",
                source,
            )
        )


class ConciseLoggingTest(unittest.TestCase):
    def logger_stream(
        self, level: int = logging.INFO
    ) -> tuple[logging.Logger, io.StringIO]:
        stream = io.StringIO()
        handler = logging.StreamHandler(stream)
        logger = logging.getLogger(f"test.concise_logging.{uuid.uuid4().hex}")
        logger.handlers = [handler]
        logger.propagate = False
        logger.setLevel(level)
        return logger, stream

    def test_log_blob_default_emits_summary_not_raw_payload(self) -> None:
        logger, stream = self.logger_stream()
        payload = {
            "id": 42,
            "status": "complete",
            "items": [{"id": 1}, {"id": 2}],
            "nested": {
                "secret": "do-not-print",
                "text": "segment " * 80,
            },
        }

        log_blob(logger, "test.payload", payload)

        output = stream.getvalue()
        self.assertIn("test.payload", output)
        self.assertIn('"id": 42', output)
        self.assertIn('"status": "complete"', output)
        self.assertIn('"items_count": 2', output)
        self.assertNotIn("segment segment segment", output)
        self.assertNotIn("do-not-print", output)

    def test_log_blob_trace_emits_full_sanitised_payload(self) -> None:
        logger, stream = self.logger_stream(level=TRACE_LEVEL)
        payload = {
            "id": 42,
            "authorization": "Bearer secret",
            "nested": {"text": "full trace payload"},
        }

        log_blob(logger, "test.payload", payload)

        output = stream.getvalue()
        self.assertIn("test.payload.begin", output)
        self.assertIn("full trace payload", output)
        self.assertIn("[redacted]", output)
        self.assertNotIn("Bearer secret", output)

    def test_summarise_for_log_keeps_ids_counts_and_byte_sizes(self) -> None:
        summary = summarise_for_log(
            {
                "asset_id": "ZZ-999",
                "filename": "manual.pdf",
                "status_code": 200,
                "chunks": [{"id": 1}, {"id": 2}, {"id": 3}],
                "content": b"abc",
            }
        )

        self.assertEqual(summary["asset_id"], "ZZ-999")
        self.assertEqual(summary["filename"], "manual.pdf")
        self.assertEqual(summary["status_code"], 200)
        self.assertEqual(summary["chunks_count"], 3)
        self.assertEqual(summary["content"], {"type": "bytes", "bytes": 3})

    def test_default_log_and_sqlalchemy_levels_are_concise(self) -> None:
        self.assertEqual(_log_level(None), DEFAULT_LOG_LEVEL)
        with patch.dict("os.environ", {}, clear=True):
            self.assertFalse(Settings.sqlalchemy_echo())
            self.assertFalse(Settings.sqlalchemy_echo_pool())


class GeneratedAnalysisPayloadTest(unittest.TestCase):
    def test_missing_known_analysis_arrays_are_treated_as_empty(self) -> None:
        payload = {"assets": [{"id": "ZZ-999"}]}
        self.assertEqual(
            normalise_analysis_payload(payload),
            {
                "entities": [],
                "assets": [{"id": "ZZ-999"}],
                "timeline_events": [],
                "compliance_gaps": [],
                "contradictions": [],
            },
        )

    def test_wrapped_analysis_payload_is_unwrapped(self) -> None:
        payload = {"analysis": {"entities": []}}
        self.assertEqual(
            normalise_analysis_payload(payload),
            {
                "entities": [],
                "assets": [],
                "timeline_events": [],
                "compliance_gaps": [],
                "contradictions": [],
            },
        )

    def test_payload_without_analysis_arrays_still_fails(self) -> None:
        with self.assertRaisesRegex(RuntimeError, "recognised analysis array"):
            normalise_analysis_payload({"message": "no structured analysis"})

    def test_generated_analysis_uses_only_llm_output(self) -> None:
        chunks = [
            {
                "document_id": 1,
                "filename": "Pump Note.txt",
                "document_type": "TXT",
                "page": 1,
                "chunk_index": 0,
                "text": (
                    "Asset ZZ-999 is a process pump. "
                    "Asset QY-888 is an instrument air compressor. "
                    "ZZ-999 inspection completed on 2026-01-02. "
                    "Required supervisor sign-off missing for ZZ-999."
                ),
            }
        ]
        llm_payload = {
            "entities": [
                {
                    "id": "ZZ-999",
                    "type": "Process Pump",
                    "confidence": 0.88,
                    "source": "Pump Note",
                    "page": 1,
                }
            ],
            "assets": [
                {
                    "id": "ZZ-999",
                    "name": "ZZ-999 Process Pump",
                    "asset_type": "Pump",
                    "location": "Unknown",
                    "risk_level": "Low",
                    "last_inspection": "2026-01-02",
                    "suggested_actions": [],
                    "source": "Pump Note",
                    "page": 1,
                }
            ],
            "timeline_events": [
                {
                    "asset_id": "ZZ-999",
                    "date": "2026-01-02",
                    "event": "ZZ-999 inspection completed on 2026-01-02.",
                    "source": "Pump Note",
                    "page": 1,
                }
            ],
            "compliance_gaps": [
                {
                    "asset_id": "ZZ-999",
                    "gap": "Missing supervisor sign-off",
                    "evidence": "Required supervisor sign-off missing for ZZ-999.",
                    "source": "Pump Note",
                    "page": 1,
                }
            ],
        }

        class FakeProvider:
            def complete_json(
                self,
                _system_prompt: str,
                _user_prompt: str,
                **_kwargs: object,
            ) -> dict[str, object]:
                return llm_payload

        with (
            patch(
                "app.services.analysis.Database.rows",
                return_value=[{"id": 1, "filename": "Pump Note.txt", "page_count": 1}],
            ),
            patch("app.services.analysis.Database.list_chunks", return_value=chunks),
            patch("app.services.analysis.Database.row", return_value={"id": 1}),
            patch(
                "app.services.analysis.pipeline.get_llm_provider",
                return_value=FakeProvider(),
            ),
        ):
            result = generate_structured_analysis()

        self.assertEqual([asset["id"] for asset in result["assets"]], ["ZZ-999"])
        self.assertEqual([entity["value"] for entity in result["entities"]], ["ZZ-999"])
        self.assertEqual(
            [event["asset_id"] for event in result["timeline_events"]], ["ZZ-999"]
        )
        self.assertEqual(
            [gap["asset_id"] for gap in result["compliance_gaps"]], ["ZZ-999"]
        )
        self.assertNotIn("QY-888", {asset["id"] for asset in result["assets"]})


class EmbeddingProviderConfigurationTest(unittest.TestCase):
    def test_local_fastembed_provider_returns_vectors(self) -> None:
        vector = [0.0] * 384

        class FakeModel:
            def __init__(self) -> None:
                self.calls: list[tuple[list[str], int]] = []

            def embed(self, texts: list[str], batch_size: int) -> list[list[float]]:
                self.calls.append((texts, batch_size))
                return [vector for _ in texts]

        model = FakeModel()
        provider = LocalFastEmbedProvider(
            LocalEmbeddingConfig(
                model_name="BAAI/bge-small-en-v1.5",
                dimensions=384,
                batch_size=32,
                cache_dir=Settings.data_dir / "fastembed-test",
                local_files_only=True,
            ),
            model=model,
        )

        self.assertEqual(provider.embed(["bearing wear evidence"]), [vector])
        self.assertEqual(model.calls, [(["bearing wear evidence"], 32)])


class UploadedSourceTest(unittest.TestCase):
    def test_every_source_file_uses_a_supported_extension(self) -> None:
        all_files = sorted(path for path in SOURCE_DIR.iterdir() if path.is_file())
        self.assertTrue(all_files)
        self.assertEqual(all_files, source_files())

    def test_each_supported_parser_reads_real_uploaded_source_content(self) -> None:
        representative_files: dict[str, Path] = {}
        for path in source_files():
            representative_files.setdefault(path.suffix.lower(), path)
        self.assertEqual(set(representative_files), SUPPORTED_EXTENSIONS)
        for extension, path in representative_files.items():
            with self.subTest(extension=extension):
                parsed = parse_document(path)
                self.assertTrue(parsed["pages"])
                self.assertTrue(parsed["text"].strip())
                self.assertGreaterEqual(parsed["page_count"], 1)
                self.assertIn("parser", parsed["metadata"])

    def test_provenance_validation_uses_source_text(self) -> None:
        path = next(path for path in source_files() if path.suffix.lower() == ".txt")
        text = parse_document(path)["text"]
        excerpt = " ".join(text.split())[:80]
        self.assertTrue(evidence_supported(excerpt, text))

    def test_filename_sanitisation_is_derived_from_an_uploaded_filename(self) -> None:
        name = source_files()[0].name
        self.assertEqual(safe_filename(f"../{name}"), name)

    def test_asset_identifier_validation_is_format_based(self) -> None:
        path = next(path for path in source_files() if path.suffix.lower() == ".txt")
        token = next(
            part.strip(".,:;()")
            for part in path.read_text(encoding="utf-8", errors="ignore").split()
            if "-" in part and any(character.isdigit() for character in part)
        )
        self.assertTrue(normalise_asset_id(token))


class WorkspaceDatabaseTest(unittest.TestCase):
    def setUp(self) -> None:
        test_database_url = Settings.test_database_url()
        if not test_database_url:
            self.skipTest(
                "TEST_DATABASE_URL is required for Postgres persistence tests."
            )
        self.temporary = tempfile.TemporaryDirectory()
        root = Path(self.temporary.name)
        self.schema = f"test_{uuid.uuid4().hex}"
        self.previous_database_url = os.environ.get("DATABASE_URL")
        self.previous_schema = os.environ.get("DATABASE_SCHEMA")
        self.previous = {
            "data_dir": Settings.data_dir,
            "upload_dir": Settings.upload_dir,
        }
        os.environ["DATABASE_URL"] = test_database_url
        self.admin_engine = sa.create_engine(
            test_database_url,
            future=True,
            connect_args={"prepare_threshold": None},
        )
        schema_created = False
        try:
            with self.admin_engine.begin() as connection:
                connection.execute(sa.text(f'CREATE SCHEMA "{self.schema}"'))
            schema_created = True
            os.environ["DATABASE_SCHEMA"] = self.schema
            Settings.data_dir = root
            Settings.upload_dir = root / "uploads"
            Database.dispose()
            Database.initialise()
        except sa.exc.SQLAlchemyError as exc:
            Database.dispose()
            if schema_created:
                with self.admin_engine.begin() as connection:
                    connection.execute(
                        sa.text(f'DROP SCHEMA IF EXISTS "{self.schema}" CASCADE')
                    )
            self.admin_engine.dispose()
            self.temporary.cleanup()
            self._restore_environment()
            self.skipTest(
                f"TEST_DATABASE_URL is configured but not reachable: {type(exc).__name__}"
            )

    def tearDown(self) -> None:
        Database.dispose()
        if hasattr(self, "admin_engine"):
            with self.admin_engine.begin() as connection:
                connection.execute(
                    sa.text(f'DROP SCHEMA IF EXISTS "{self.schema}" CASCADE')
                )
            self.admin_engine.dispose()
        self._restore_environment()

    def _restore_environment(self) -> None:
        if getattr(self, "previous_schema", None) is None:
            os.environ.pop("DATABASE_SCHEMA", None)
        else:
            os.environ["DATABASE_SCHEMA"] = self.previous_schema
        if getattr(self, "previous_database_url", None) is None:
            os.environ.pop("DATABASE_URL", None)
        else:
            os.environ["DATABASE_URL"] = self.previous_database_url
        for name, value in self.previous.items():
            setattr(Settings, name, value)
        if hasattr(self, "temporary"):
            self.temporary.cleanup()

    def test_content_hash_lookup_and_workspace_clear(self) -> None:
        path = source_files()[0]
        content_hash = hashlib.sha256(path.read_bytes()).hexdigest()
        parsed = parse_document(path)
        document_id = Database.insert_ingested_document(
            filename=path.name,
            document_type=path.suffix.removeprefix(".").upper(),
            parsed_text=parsed["text"],
            page_count=parsed["page_count"],
            content_hash=content_hash,
            chunks=[],
            parser_metadata=parsed["metadata"],
        )
        self.assertEqual(
            Database.find_document_by_hash(content_hash)["id"], document_id
        )
        Database.clear_workspace()
        self.assertEqual(Database.list_documents(), [])


class StorageBackendStaticTest(unittest.TestCase):
    def test_runtime_code_does_not_reference_local_database_backends(self) -> None:
        forbidden = ("sqlite", "sqlite3", "database_path", "chroma_dir", "chromadb")
        checked_roots = [REPO_ROOT / "backend" / "app", REPO_ROOT / "scripts"]
        for root in checked_roots:
            for path in root.rglob("*"):
                if any(part in {"__pycache__", ".venv"} for part in path.parts):
                    continue
                if not path.is_file() or path.suffix.lower() not in {
                    ".py",
                    ".js",
                    ".mjs",
                }:
                    continue
                content = path.read_text(encoding="utf-8", errors="ignore").lower()
                found = [token for token in forbidden if token in content]
                self.assertEqual(found, [], f"{path} contains forbidden DB refs.")


if __name__ == "__main__":
    unittest.main()
