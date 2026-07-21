import { defineConfig, devices } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000";
const repoRoot = path.resolve(__dirname, "..");
const testDatabaseUrl =
	process.env.E2E_DATABASE_URL ||
	process.env.TEST_DATABASE_URL ||
	ReadEnvValue(path.join(repoRoot, ".env"), "TEST_DATABASE_URL");

if (!testDatabaseUrl) {
	throw new Error(
		"TEST_DATABASE_URL is required for live E2E runs because the suite clears the isolated workspace.",
	);
}

export default defineConfig({
	expect: { timeout: 60_000 },
	fullyParallel: false,
	outputDir: "test-results",
	projects: [
		{
			name: "chromium-demo",
			use: {
				...devices["Desktop Chrome"],
				browserName: "chromium",
				viewport: { height: 900, width: 1440 },
			},
		},
	],
	reporter: [["line"]],
	testDir: "./e2e",
	timeout: 1_800_000,
	use: {
		acceptDownloads: true,
		baseURL,
		permissions: ["clipboard-read", "clipboard-write"],
		screenshot: "only-on-failure",
		trace: "retain-on-failure",
		video: {
			mode: "on",
			size: { height: 900, width: 1440 },
		},
		viewport: { height: 900, width: 1440 },
	},
	webServer: [
		{
			command: [
				path.join("..", "backend", ".venv", "Scripts", "python.exe"),
				"-m",
				"uvicorn",
				"app.main:app",
				"--host",
				"127.0.0.1",
				"--port",
				"8000",
			].join(" "),
			cwd: path.join(repoRoot, "backend"),
			env: {
				DATABASE_URL: testDatabaseUrl,
				LOG_LEVEL: "INFO",
				TERMINAL_LOG_LEVEL: "INFO",
			},
			reuseExistingServer: false,
			timeout: 180_000,
			url: "http://127.0.0.1:8000/health",
		},
		{
			command: "npm run dev -- --hostname 127.0.0.1 --port 3000",
			cwd: path.join(repoRoot, "frontend"),
			reuseExistingServer: false,
			timeout: 180_000,
			url: baseURL,
		},
	],
	workers: 1,
});

function ReadEnvValue(envPath: string, key: string) {
	if (!existsSync(envPath)) return "";
	const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const match = trimmed.match(/^([^=]+)=(.*)$/);
		if (!match || match[1].trim() !== key) continue;
		return match[2].trim().replace(/^['"]|['"]$/g, "");
	}
	return "";
}
