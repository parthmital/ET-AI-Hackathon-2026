from __future__ import annotations

from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from app.services.graph import graph_edge_record, graph_edge_response, graph_to_cypher
from app.services.ingestion import clear_workspace
from app.services.intelligence import run_chat
from app.services.llm import DeepSeekProvider, ProviderConfig
from app.settings import Settings
from app.types import ChatRequest


class StructuredOutputPromptTest(unittest.TestCase):
    def test_deepseek_receives_schema_in_json_object_prompt(self) -> None:
        provider = DeepSeekProvider(
            ProviderConfig(
                name="deepseek",
                api_key="deepseek-key",
                base_url="https://api.deepseek.com",
                model="deepseek-v4-flash",
            )
        )
        schema = {
            "type": "object",
            "properties": {"required_value": {"type": "string"}},
            "required": ["required_value"],
        }
        with patch.object(
            provider,
            "_completion_text",
            return_value='{"required_value": "ok"}',
        ) as completion:
            result = provider.complete_json(
                "Return JSON.", "Use the evidence.", schema=schema
            )

        self.assertEqual(result, {"required_value": "ok"})
        system_prompt = completion.call_args.args[0]
        self.assertIn("JSON Schema", system_prompt)
        self.assertIn('"required":["required_value"]', system_prompt)
        self.assertEqual(
            completion.call_args.kwargs["response_format"], {"type": "json_object"}
        )


class WorkspaceFileIsolationTest(unittest.TestCase):
    def test_clear_workspace_removes_only_files_recorded_in_workspace(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            upload_dir = Path(temporary_directory)
            tracked = upload_dir / "tracked.txt"
            unrelated = upload_dir / "unrelated.txt"
            tracked.write_text("tracked", encoding="utf-8")
            unrelated.write_text("unrelated", encoding="utf-8")
            previous_upload_dir = Settings.upload_dir
            Settings.upload_dir = upload_dir
            try:
                with (
                    patch(
                        "app.services.ingestion.Database.list_documents",
                        return_value=[{"filename": tracked.name}],
                    ),
                    patch("app.services.ingestion.Database.clear_workspace") as clear,
                ):
                    self.assertEqual(clear_workspace(), {"status": "cleared"})
            finally:
                Settings.upload_dir = previous_upload_dir

            clear.assert_called_once_with()
            self.assertFalse(tracked.exists())
            self.assertTrue(unrelated.exists())


class GraphEdgeContractTest(unittest.TestCase):
    def test_graph_edges_expose_node_aliases_and_evidence(self) -> None:
        edge = graph_edge_record(
            "ZZ-999",
            "Failure Mode:seal leakage",
            "EQUIPMENT_HAS_FAILURE",
            0.88,
            "Synthetic Evidence.txt",
            1,
            "ZZ-999 seal leakage linked to bearing wear.",
        )

        response = graph_edge_response(0, edge["source_id"], edge["target_id"], edge)

        self.assertEqual(response["source_node"], "ZZ-999")
        self.assertEqual(response["target_node"], "Failure Mode:seal leakage")
        self.assertEqual(response["validation_status"], "accepted")
        self.assertEqual(response["source_document"], "Synthetic Evidence.txt")
        cypher = graph_to_cypher(
            {
                "nodes": [
                    {
                        "id": "ZZ-999",
                        "data": {"label": "ZZ-999", "type": "Equipment"},
                    },
                    {
                        "id": "Failure Mode:seal leakage",
                        "data": {
                            "label": "seal leakage",
                            "type": "Failure Mode",
                        },
                    },
                ],
                "edges": [response],
            }
        )
        self.assertIn("source_node", cypher)
        self.assertIn("target_node", cypher)


class RagPipelineTest(unittest.TestCase):
    def test_chat_retrieves_vector_context_before_calling_llm(self) -> None:
        events: list[str] = []
        matches = [
            {
                "text": "Pump P-101 seal leakage caused a forced shutdown.",
                "metadata": {
                    "document_id": 7,
                    "filename": "Incident Report.txt",
                    "document_type": "TXT",
                    "page": 1,
                    "chunk_index": 0,
                },
                "score": 0.91,
            }
        ]

        class FakeProvider:
            def answer(self, question: str, context: list[dict]) -> str:
                events.append("llm")
                self.question = question
                self.context = context
                return "P-101 evidence was retrieved before generation."

        provider = FakeProvider()

        def query_vector_store(
            text: str, filters: dict | None = None, limit: int = 6
        ) -> list[dict]:
            events.append("vector")
            self.assertEqual(text, "What failed on P-101?")
            self.assertEqual(filters, {})
            self.assertEqual(limit, 6)
            return matches

        with (
            patch("app.services.intelligence.get_llm_provider", return_value=provider),
            patch("app.services.intelligence.vector_store.query", query_vector_store),
            patch(
                "app.services.intelligence.related_entities_from_matches",
                return_value=["P-101"],
            ),
            patch(
                "app.services.intelligence.graph_paths_for_question", return_value=[]
            ),
        ):
            result = run_chat(ChatRequest(question="What failed on P-101?"))

        self.assertEqual(events, ["vector", "llm"])
        self.assertEqual(provider.context, matches)
        self.assertEqual(result["citations"][0]["document"], "Incident Report.txt")


if __name__ == "__main__":
    unittest.main()
