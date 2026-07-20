#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { withConciseEnv, withVerboseEnv } from "./verbose-env.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(scriptPath), "..");
const verbose = process.argv.includes("--verbose");
const isWindows = process.platform === "win32";
const pythonPath = isWindows
	? join(repoRoot, "backend", ".venv", "Scripts", "python.exe")
	: join(repoRoot, "backend", ".venv", "bin", "python");
const benchmarkScript = join(repoRoot, "scripts", "benchmark.py");

if (!existsSync(pythonPath)) {
	console.error(
		`Backend virtual environment was not found at ${pythonPath}. Run npm run setup first.`,
	);
	process.exit(1);
}

const result = spawnSync(pythonPath, [benchmarkScript], {
	cwd: repoRoot,
	env: verbose ? withVerboseEnv(process.env) : withConciseEnv(process.env),
	stdio: "inherit",
});

process.exit(result.status ?? 1);
