from __future__ import annotations

import asyncio
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch
import zipfile

from app.api.dependencies import use_local_workspace
from app.core.workspace import WorkspaceContext, get_workspace_context
from app.services.ingestion import validate_upload_content


class LocalWorkspaceResolutionTest(unittest.TestCase):
    def test_dependency_sets_local_workspace_context(self) -> None:
        expected = WorkspaceContext(
            workspace_id="local-workspace",
            workspace_name="Local Workspace",
        )

        async def call_dependency() -> tuple[WorkspaceContext, WorkspaceContext | None]:
            result = await use_local_workspace()
            return result, get_workspace_context()

        with patch(
            "app.api.dependencies.Database.ensure_local_workspace",
            return_value=expected,
        ) as ensure:
            result, current = asyncio.run(call_dependency())

        self.assertEqual(result, expected)
        self.assertEqual(current, expected)
        ensure.assert_called_once_with()


class UploadContentValidationTest(unittest.TestCase):
    def test_rejects_pdf_without_pdf_signature(self) -> None:
        with TemporaryDirectory() as directory:
            path = Path(directory) / "manual.pdf"
            path.write_bytes(b"not a pdf")

            with self.assertRaises(ValueError) as raised:
                validate_upload_content(path, ".pdf", "application/pdf")

        self.assertIn("PDF signature", str(raised.exception))

    def test_accepts_docx_zip_shape(self) -> None:
        with TemporaryDirectory() as directory:
            path = Path(directory) / "manual.docx"
            with zipfile.ZipFile(path, "w") as archive:
                archive.writestr("[Content_Types].xml", "")
                archive.writestr("word/document.xml", "<document />")

            validate_upload_content(
                path,
                ".docx",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )

    def test_rejects_binary_text_upload(self) -> None:
        with TemporaryDirectory() as directory:
            path = Path(directory) / "manual.txt"
            path.write_bytes(b"valid text prefix\x00binary tail")

            with self.assertRaises(ValueError) as raised:
                validate_upload_content(path, ".txt", "text/plain")

        self.assertIn("binary", str(raised.exception))


if __name__ == "__main__":
    unittest.main()
