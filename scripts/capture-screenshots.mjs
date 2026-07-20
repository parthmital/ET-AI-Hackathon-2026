#!/usr/bin/env node

import { createRequire } from "node:module";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(scriptPath), "..");
const frontendDir = join(repoRoot, "frontend");
const frontendRequire = createRequire(join(frontendDir, "package.json"));
const { chromium } = frontendRequire("playwright");

const baseUrl = process.env.SCREENSHOT_BASE_URL ?? "http://127.0.0.1:3000";
const apiOrigin =
	process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";
const outputDir = join(repoRoot, "docs", "screenshots");

const asset = {
	id: "PX-900",
	name: "PX-900 Feed Pump",
	asset_type: "Pump",
	location: "Unit 4",
	risk_level: "High",
	last_inspection: "2026-06-03",
	open_compliance_gaps: 1,
	suggested_actions: [
		"Verify restart authorisation.",
		"Inspect seal pot pressure trend.",
	],
	source_document: "Feed Pump Evidence.txt",
	source_page: 1,
	evidence_text:
		"PX-900 was marked high risk after vibration and seal pressure alarms.",
};

const gap = {
	id: 1,
	asset_id: asset.id,
	severity: "High",
	gap_type: "Restart Authorisation",
	description: "Restart approval is inconsistent across source evidence.",
	evidence: "PX-900 remained under lockout pending supervisor sign-off.",
	corrective_action: "Reconcile lockout state before restart.",
	status: "Open",
	source_document: "Safety Checklist.txt",
	source_page: 2,
	evidence_status: "accepted",
	confidence: 0.9,
};

const timelineEvent = {
	id: 1,
	asset_id: asset.id,
	event_date: "2026-06-03",
	event_type: "Historian Signal",
	title: "Seal Pressure Alarm",
	description: "PX-900 seal pot pressure entered low alarm.",
	source_document: "Sensor Events.csv",
	source_page: 1,
};

const contradiction = {
	id: 1,
	asset_id: asset.id,
	severity: "High",
	contradiction_type: "Operational Conflict",
	description: "Restart-ready status conflicts with lockout evidence.",
	evidence_a: "PX-900 was marked ready for restart.",
	source_document_a: "Work Order.txt",
	source_page_a: 1,
	evidence_b: "PX-900 remained under lockout pending supervisor sign-off.",
	source_document_b: "Safety Checklist.txt",
	source_page_b: 2,
	status: "Open",
};

const graphPath = {
	asset_id: asset.id,
	title: `${asset.id} linked evidence path`,
	summary:
		"PX-900 connects generated asset intelligence to source documents, alarms, gaps, and contradiction evidence.",
	nodes: [
		{ id: asset.id, label: asset.name, type: "Equipment" },
		{ id: "Compliance Gap:1", label: gap.gap_type, type: "Compliance Gap" },
		{ id: "Document:1", label: "Safety Checklist.txt", type: "Document" },
	],
	edges: [
		{
			id: "edge-1",
			source: asset.id,
			target: "Compliance Gap:1",
			source_node: asset.id,
			target_node: "Compliance Gap:1",
			label: "EQUIPMENT_HAS_COMPLIANCE_GAP",
			relation_type: "EQUIPMENT_HAS_COMPLIANCE_GAP",
			confidence: 0.9,
			source_document: gap.source_document,
			source_page: gap.source_page,
			evidence_text: gap.evidence,
			validation_status: "accepted",
			validation_reason:
				"Relationship has source evidence and sufficient confidence.",
		},
	],
	confidence: 0.9,
};

const graph = {
	nodes: [
		{
			id: asset.id,
			data: {
				label: asset.name,
				type: "Equipment",
				details: {
					risk_level: asset.risk_level,
					location: asset.location,
				},
			},
			position: { x: 0, y: 0 },
		},
		{
			id: "Compliance Gap:1",
			data: {
				label: gap.gap_type,
				type: "Compliance Gap",
				details: gap,
			},
			position: { x: 260, y: 0 },
		},
		{
			id: "Document:1",
			data: {
				label: "Safety Checklist.txt",
				type: "Document",
				details: { document_type: "TXT" },
			},
			position: { x: 520, y: 0 },
		},
	],
	edges: graphPath.edges,
	edge_audit: { accepted: 1, weak: 0, rejected: 0, total: 1 },
};

const analysis = {
	analysis_status: "complete",
	analysis_message: "",
	analysis_source: "screenshot",
	analysis_started_at: "2026-06-03T08:00:00Z",
	analysis_completed_at: "2026-06-03T08:00:05Z",
	documents_ingested: 3,
	entities_extracted: 12,
	assets: 1,
	timeline_events: 1,
	compliance_gaps: 1,
	contradictions: 1,
	agent_stages: [
		{
			stage: "Document",
			status: "complete",
			records: 3,
			message: "3 documents ingested.",
		},
		{
			stage: "Graph",
			status: "complete",
			records: 1,
			message: "1 persisted evidence edge.",
		},
		{
			stage: "Compliance",
			status: "complete",
			records: 1,
			message: "1 generated gap tied to source evidence.",
		},
		{
			stage: "RCA",
			status: "ready",
			records: 1,
			message: "1 contradiction available for RCA context.",
		},
	],
};

const responses = {
	"GET /health": {
		status: "OK",
		service: "Industrial Ops Brain API",
		llm_configured: true,
		live_only: true,
		provider_status: "ready",
		active_provider: "local",
		active_model: "mock",
		provider_chain: [],
		json_schema_enabled: true,
		last_error: null,
		ocr: {
			enabled: true,
			available: true,
			engine: "tesseract",
			message: "ready",
		},
		analysis,
	},
	"GET /documents": [
		{
			id: 1,
			filename: "Safety Checklist.txt",
			document_type: "TXT",
			upload_time: "2026-06-03T08:00:00Z",
			page_count: 2,
			character_count: 1240,
			parser: "text",
			ocr_used: false,
			ocr_engine: "",
			ocr_confidence: null,
			extracted_tables_count: 0,
			extracted_images_count: 0,
			extraction_warnings: [],
		},
	],
	"GET /entities": [
		{
			id: 1,
			document_id: 1,
			filename: "Safety Checklist.txt",
			page: 2,
			entity_type: "Equipment",
			value: asset.id,
			confidence: 0.93,
			context: gap.evidence,
		},
	],
	"GET /analysis/status": analysis,
	"GET /assets": [asset],
	[`GET /assets/${asset.id}/timeline`]: [timelineEvent],
	[`GET /assets/${asset.id}/risk-summary`]: {
		asset_id: asset.id,
		risk_level: asset.risk_level,
		last_inspection: asset.last_inspection,
		source_document: asset.source_document,
		source_page: asset.source_page,
		evidence_text: asset.evidence_text,
		open_compliance_gaps: [gap],
		failure_patterns: ["Seal pressure instability"],
		maintenance_history: [timelineEvent],
		suggested_next_actions: asset.suggested_actions,
		suggested_action_evidence: [],
		graph_paths: [graphPath],
		contradictions: [contradiction],
	},
	[`GET /assets/${asset.id}/evidence-pack`]: {
		filename: "industrial-ops-px-900-evidence-pack.md",
		markdown: "# Asset Evidence Pack\n",
	},
	"GET /graph": graph,
	"GET /graph/paths": [graphPath],
	"GET /graph/export": {
		filename: "industrial-ops-graph.json",
		format: "json",
		content: JSON.stringify(graph, null, 2),
	},
	"GET /compliance/gaps": [gap],
	"GET /compliance/evidence-pack": {
		filename: "industrial-ops-compliance-evidence-pack.md",
		markdown: "# Compliance Evidence Pack\n",
	},
	"GET /contradictions": [contradiction],
};

mkdirSync(outputDir, { recursive: true });

const browser = await chromium.launch({
	channel: process.env.PLAYWRIGHT_CHANNEL || "chrome",
	headless: true,
});
const context = await browser.newContext({
	acceptDownloads: true,
	viewport: { width: 1440, height: 1100 },
});
const page = await context.newPage();
const diagnostics = [];

page.on("console", (message) => {
	if (message.type() === "error")
		diagnostics.push(`console: ${message.text()}`);
});
page.on("pageerror", (error) =>
	diagnostics.push(`pageerror: ${error.message}`),
);
page.on("requestfailed", (request) =>
	diagnostics.push(`request failed: ${request.url()}`),
);

await page.route(`${apiOrigin}/**`, async (route) => {
	const request = route.request();
	const url = new URL(request.url());
	const key = `${request.method()} ${url.pathname}`;
	let payload = responses[key];
	if (url.pathname === "/graph/export")
		payload = responses["GET /graph/export"];
	if (request.method() === "POST" && url.pathname === "/chat") {
		payload = {
			answer:
				"PX-900 has accepted source evidence for lockout and restart conflict.",
			citations: [
				{
					document: gap.source_document,
					page: gap.source_page,
					snippet: gap.evidence,
				},
			],
			confidence: 0.9,
			related_entities: [asset.id],
			graph_paths: [graphPath],
		};
	}
	if (request.method() === "POST" && url.pathname === "/compliance/check") {
		payload = {
			summary: "One high severity restart authorisation gap is open.",
			gaps: [gap],
		};
	}
	if (request.method() === "POST" && url.pathname === "/rca") {
		payload = {
			asset: asset.id,
			symptom: "Low seal pressure",
			likely_causes: ["Seal pot pressure instability"],
			supporting_evidence: [
				{
					document: gap.source_document,
					page: gap.source_page,
					snippet: gap.evidence,
				},
			],
			recommended_checks: ["Verify lockout and restart authorisation."],
			preventive_actions: ["Add restart approval hold point."],
			cited_documents: [gap.source_document],
			graph_paths: [graphPath],
			contradictions: [contradiction],
			likely_cause_evidence: [],
			recommended_check_evidence: [],
			preventive_action_evidence: [],
		};
	}
	if (!payload) {
		await route.fulfill({
			status: 404,
			json: { detail: `No mock for ${key}` },
		});
		return;
	}
	await route.fulfill({ status: 200, json: payload });
});

async function capture(route, name) {
	await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle" });
	await page.screenshot({ fullPage: true, path: join(outputDir, name) });
}

await capture("/documents", "documents.png");

await page.goto(`${baseUrl}/chat`, { waitUntil: "networkidle" });
await page
	.getByLabel("Question")
	.fill("What evidence supports the restart risk?");
await page.getByRole("button", { name: "Ask With Citations" }).click();
await page.getByText("PX-900 has accepted source evidence").waitFor();
await page.screenshot({ fullPage: true, path: join(outputDir, "ask.png") });

await capture("/assets", "assets.png");
await page.getByRole("button", { exact: true, name: "Trace" }).click();
await page.screenshot({
	fullPage: true,
	path: join(outputDir, "evidence-export.png"),
});

await page.goto(`${baseUrl}/graph`, { waitUntil: "networkidle" });
await page.locator(".react-flow__node").first().waitFor();
await page.screenshot({ fullPage: true, path: join(outputDir, "graph.png") });

await page.goto(`${baseUrl}/compliance`, { waitUntil: "networkidle" });
await page.getByLabel("Compliance Request").fill("Review open gaps.");
await page.getByRole("button", { name: "Run Check" }).first().click();
await page.getByText("One high severity restart").waitFor();
await page.screenshot({
	fullPage: true,
	path: join(outputDir, "compliance.png"),
});

await page.goto(`${baseUrl}/rca`, { waitUntil: "networkidle" });
await page.getByRole("combobox", { name: "Asset" }).click();
await page.getByRole("option", { name: new RegExp(asset.id) }).click();
await page.getByLabel("Symptom").fill("Low seal pressure");
await page.getByRole("button", { name: "Generate RCA" }).click();
await page.getByText("Seal pot pressure instability").waitFor();
await page.screenshot({ fullPage: true, path: join(outputDir, "rca.png") });

await browser.close();

if (diagnostics.length) {
	console.error(diagnostics.join("\n"));
	process.exit(1);
}

if (!existsSync(join(outputDir, "documents.png"))) {
	console.error("Screenshot capture did not write expected files.");
	process.exit(1);
}

console.log(`Screenshots written to ${outputDir}`);
