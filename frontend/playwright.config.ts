import { defineConfig, devices } from "@playwright/test";

const channel = process.env.PLAYWRIGHT_CHANNEL || "chrome";

export default defineConfig({
	expect: { timeout: 60_000 },
	fullyParallel: false,
	outputDir: "test-results",
	projects: [
		{
			name: "disposable-chrome",
			use: {
				...devices["Desktop Chrome"],
				channel,
			},
		},
	],
	reporter: [["line"]],
	testDir: "./e2e",
	timeout: 300_000,
	use: {
		acceptDownloads: true,
		baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000",
		permissions: ["clipboard-read", "clipboard-write"],
		screenshot: "only-on-failure",
		trace: "retain-on-failure",
		video: "retain-on-failure",
		viewport: { height: 900, width: 1440 },
	},
	workers: 1,
});
