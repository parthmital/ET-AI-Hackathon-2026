from __future__ import annotations

import ast
from pathlib import Path
import unittest

BACKEND_APP = Path(__file__).resolve().parents[1] / "app"


def module_name(path: Path) -> str:
    return ".".join(("app", *path.relative_to(BACKEND_APP).with_suffix("").parts))


def imported_modules(path: Path) -> set[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    imports: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            imports.update(alias.name for alias in node.names)
        if isinstance(node, ast.ImportFrom) and node.module:
            imports.add(node.module)
    return imports


class ImportBoundaryTest(unittest.TestCase):
    def test_backend_import_layers_flow_in_one_direction(self) -> None:
        violations: list[str] = []
        for path in BACKEND_APP.rglob("*.py"):
            if "__pycache__" in path.parts:
                continue
            module = module_name(path)
            imports = imported_modules(path)

            if module.startswith("app.db."):
                forbidden = sorted(
                    item
                    for item in imports
                    if item.startswith("app.api.") or item.startswith("app.services.")
                )
                if forbidden:
                    violations.append(f"{module} imports {forbidden}")

            if module.startswith("app.services."):
                forbidden = sorted(
                    item for item in imports if item.startswith("app.api.")
                )
                if forbidden:
                    violations.append(f"{module} imports {forbidden}")

            if module.startswith("app.repositories."):
                forbidden = sorted(
                    item
                    for item in imports
                    if item.startswith("app.api.") or item.startswith("app.services.")
                )
                if forbidden:
                    violations.append(f"{module} imports {forbidden}")

            if module.startswith("app.core."):
                forbidden = sorted(
                    item
                    for item in imports
                    if item.startswith(("app.api.", "app.services.", "app.db."))
                )
                if forbidden:
                    violations.append(f"{module} imports {forbidden}")

        self.assertEqual(violations, [])


if __name__ == "__main__":
    unittest.main()
