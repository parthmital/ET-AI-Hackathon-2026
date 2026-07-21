import {
	expect,
	test,
	type Page,
	type Request,
	type TestInfo,
} from "@playwright/test";
import { readdirSync } from "node:fs";
import path from "node:path";
import { FormatDisplayLabel } from "../lib/format";

const frontendApiOrigin = "http://127.0.0.1:8000";
const testApiOrigin = process.env.E2E_API_ORIGIN;
const sampleDataDirectory = path.resolve(__dirname, "../../sample_data");
const sampleFiles = readdirSync(sampleDataDirectory)
	.map((name) => path.join(sampleDataDirectory, name))
	.sort();
const sampleFileCount = sampleFiles.length;
const diagnosticsByPage = new WeakMap<Page, string[]>();
const apiRequestsByPage = new WeakMap<Page, Set<Request>>();

if (!testApiOrigin || testApiOrigin === frontendApiOrigin) {
	throw new Error(
		"E2E_API_ORIGIN must point to an isolated backend. Refusing to run destructive UI tests against the default workspace.",
	);
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ request }) => {
	const healthResponse = await request.get(`${testApiOrigin}/health`);
	expect(healthResponse.ok()).toBeTruthy();
	const health = await healthResponse.json();
	expect(health.status).toBe("OK");
	expect(health.llm_configured).toBe(true);
	expect(health.ocr.available).toBe(true);
	if (process.env.E2E_EXPECT_EMPTY_START !== "false") {
		expect(health.analysis.documents_ingested).toBe(0);
	}
});

test.beforeEach(async ({ page }) => {
	const diagnostics: string[] = [];
	const apiRequests = new Set<Request>();
	diagnosticsByPage.set(page, diagnostics);
	apiRequestsByPage.set(page, apiRequests);

	await page.route(`${frontendApiOrigin}/**`, async (route) => {
		const redirectedUrl = route
			.request()
			.url()
			.replace(frontendApiOrigin, testApiOrigin);
		await route.continue({ url: redirectedUrl });
	});

	page.on("console", (message) => {
		if (message.type() === "error") {
			diagnostics.push(`console: ${message.text()}`);
		}
	});
	page.on("pageerror", (error) => {
		diagnostics.push(`pageerror: ${error.message}`);
	});
	page.on("request", (request) => {
		if (request.url().startsWith(frontendApiOrigin)) apiRequests.add(request);
	});
	page.on("requestfinished", (request) => apiRequests.delete(request));
	page.on("requestfailed", (request) => {
		apiRequests.delete(request);
		const reason = request.failure()?.errorText || "unknown failure";
		if (reason.includes("ERR_ABORTED")) return;
		diagnostics.push(
			`requestfailed: ${request.method()} ${request.url()} ${reason}`,
		);
	});
	page.on("response", (response) => {
		if (response.status() < 400) return;
		if (!response.url().startsWith("http://127.0.0.1:")) return;
		diagnostics.push(
			`response: ${response.status()} ${response.request().method()} ${response.url()}`,
		);
	});
});

test.afterEach(async ({ page }, testInfo) => {
	const diagnostics = diagnosticsByPage.get(page) ?? [];
	await AttachDiagnostics(testInfo, diagnostics);
	expect(diagnostics, "Unexpected browser diagnostics").toEqual([]);
});

test("uploads every supported source, performs OCR and runs live extraction", async ({
	page,
	request,
}, testInfo) => {
	await OpenRoute(page, "/documents", "Evidence Workspace");
	await expect(
		page.getByRole("heading", { name: "Source Files" }),
	).toBeVisible();
	await expect(page.getByText("0 Ready")).toBeVisible();
	await expect(
		page.getByRole("button", { name: "Run Extraction" }),
	).toBeDisabled();
	await expect(
		page.getByRole("button", { exact: true, name: "Select Folder" }),
	).toHaveCount(0);

	const dropZone = page.getByRole("button", {
		name: "Drop plant files here",
	});
	const unsupportedChooser = page.waitForEvent("filechooser");
	await dropZone.click();
	await (
		await unsupportedChooser
	).setFiles({
		buffer: Buffer.from("not a supported document"),
		mimeType: "application/octet-stream",
		name: "unsupported.bin",
	});
	await expect(page.getByText("Unsupported File Type")).toBeVisible();
	await page.getByRole("button", { name: "Remove unsupported.bin" }).click();

	const filesChooser = page.waitForEvent("filechooser");
	await page
		.getByRole("button", { exact: true, name: "Upload Multiple Files" })
		.click();
	await (await filesChooser).setFiles(sampleFiles);
	await expect(
		page.getByText(`${sampleFileCount} selected, 0 need attention.`),
	).toBeVisible();
	await page.getByRole("button", { name: "Clear Queue" }).click();
	await expect(
		page.getByText(`${sampleFileCount} selected, 0 need attention.`),
	).toHaveCount(0);

	const uploadFilesChooser = page.waitForEvent("filechooser");
	await page
		.getByRole("button", { exact: true, name: "Upload Multiple Files" })
		.click();
	await (await uploadFilesChooser).setFiles(sampleFiles);
	const uploadResponsePromise = page.waitForResponse(
		(response) =>
			response.url() === `${testApiOrigin}/documents/upload-batch` &&
			response.request().method() === "POST",
		{ timeout: 180_000 },
	);
	await page.getByRole("button", { exact: true, name: "Upload" }).click();
	const uploadResponse = await uploadResponsePromise;
	expect(uploadResponse.status()).toBe(200);
	const uploadResult = await uploadResponse.json();
	expect(uploadResult.uploaded_count).toBe(sampleFileCount);
	expect(uploadResult.duplicate_count).toBe(0);
	expect(uploadResult.failed_count).toBe(0);
	await expect(
		page.getByText(`Indexed: ${sampleFileCount}. Duplicates: 0. Failed: 0.`),
	).toBeVisible();

	const documentsResponse = await request.get(`${testApiOrigin}/documents`);
	expect(documentsResponse.ok()).toBeTruthy();
	const documents = await documentsResponse.json();
	expect(documents).toHaveLength(sampleFileCount);
	const scannedDocument = documents.find(
		(document: { document_type: string; ocr_used: boolean }) =>
			document.document_type === "PDF" && document.ocr_used,
	);
	expect(scannedDocument).toMatchObject({
		document_type: "PDF",
		ocr_engine: "rapidocr",
		ocr_used: true,
		page_count: 1,
	});
	expect(scannedDocument.character_count).toBeGreaterThan(100);
	expect(scannedDocument.ocr_confidence).toBeGreaterThan(0.9);

	const duplicateChooser = page.waitForEvent("filechooser");
	await page
		.getByRole("button", { exact: true, name: "Upload Multiple Files" })
		.click();
	await (await duplicateChooser).setFiles(sampleFiles[0]);
	const duplicateResponsePromise = page.waitForResponse(
		(response) =>
			response.url() === `${testApiOrigin}/documents/upload-batch` &&
			response.request().method() === "POST",
	);
	await page.getByRole("button", { exact: true, name: "Upload" }).click();
	const duplicateResult = await (await duplicateResponsePromise).json();
	expect(duplicateResult.duplicate_count).toBe(1);
	await expect(
		page.getByText("Indexed: 0. Duplicates: 1. Failed: 0."),
	).toBeVisible();

	const extractionResponsePromise = page.waitForResponse(
		(response) =>
			response.url() === `${testApiOrigin}/analysis/regenerate` &&
			response.request().method() === "POST",
		{ timeout: 240_000 },
	);
	await page.getByRole("button", { name: "Run Extraction" }).click();
	const extractionResponse = await extractionResponsePromise;
	expect(extractionResponse.status()).toBe(200);
	const extraction = await extractionResponse.json();
	expect(extraction.analysis_status).toBe("complete");
	expect(extraction.assets).toBeGreaterThan(0);
	expect(extraction.timeline_events).toBeGreaterThan(0);
	expect(extraction.compliance_gaps).toBeGreaterThan(0);
	expect(extraction.contradictions).toBeGreaterThanOrEqual(0);
	expect(extraction.agent_stages?.length).toBeGreaterThan(0);
	await expect(page.getByText(/Extraction complete:/)).toBeVisible({
		timeout: 30_000,
	});

	const entitiesResponse = await request.get(`${testApiOrigin}/entities`);
	expect(entitiesResponse.ok()).toBeTruthy();
	const generatedEntities: Array<{ value: string }> =
		await entitiesResponse.json();
	const entitySearchValue = generatedEntities[0]?.value ?? "";
	expect(entitySearchValue).not.toBe("");
	await page.getByLabel("Search evidence").fill(entitySearchValue);
	await expect(page.getByText(/matching/i).first()).toBeVisible();
	await page.getByLabel("Search evidence").fill("");
	const entityType = page.getByRole("combobox", {
		name: "Filter entity type",
	});
	await entityType.click();
	const entityOptions = page.getByRole("option");
	if ((await entityOptions.count()) > 1) {
		await entityOptions.nth(1).click();
		await entityType.click();
		await page.getByRole("option", { name: "All types" }).click();
	} else {
		await page.keyboard.press("Escape");
	}

	await page.getByRole("button", { exact: true, name: "Clear" }).click();
	await expect(
		page.getByRole("dialog", { name: "Clear Workspace" }),
	).toBeVisible();
	await page.getByRole("button", { name: "Cancel" }).click();
	await expect(
		page.getByRole("dialog", { name: "Clear Workspace" }),
	).toHaveCount(0);
	await ExpectNoHorizontalOverflow(page);
	await page.screenshot({
		fullPage: true,
		path: testInfo.outputPath("documents.png"),
	});
});

test("clicks every dashboard link, navigation item, theme control and mobile drawer control", async ({
	page,
}, testInfo) => {
	await OpenRoute(page, "/", "Command Centre");
	await expect(
		page.getByText(
			"Operational intelligence built only from uploaded evidence.",
		),
	).toBeVisible();

	const mainLinkCount = await page.locator("main a").count();
	for (let index = 0; index < mainLinkCount; index += 1) {
		await OpenRoute(page, "/", "Command Centre");
		const link = page.locator("main a").nth(index);
		const href = await link.getAttribute("href");
		expect(href).toBeTruthy();
		await link.click();
		await expect(page).toHaveURL(new RegExp(`${EscapeRegExp(href || "/")}$`));
		await WaitForApiQuiet(page);
	}

	const navigation = [
		["Command", "/"],
		["Evidence", "/documents"],
		["Ask", "/chat"],
		["Assets", "/assets"],
		["Graph", "/graph"],
		["Compliance", "/compliance"],
		["RCA", "/rca"],
	] as const;
	for (const [label, href] of navigation) {
		await OpenRoute(page, "/", "Command Centre");
		await page
			.getByRole("navigation", { name: "Main Navigation" })
			.getByRole("link", { exact: true, name: label })
			.click();
		await expect(page).toHaveURL(new RegExp(`${EscapeRegExp(href)}$`));
		await WaitForApiQuiet(page);
	}

	await OpenRoute(page, "/", "Command Centre");
	const startingTheme = await page.locator("html").getAttribute("data-theme");
	const themeButton = page.getByRole("button", {
		name: /Switch to (light|dark) mode/,
	});
	await themeButton.click();
	await expect(page.locator("html")).not.toHaveAttribute(
		"data-theme",
		startingTheme || "",
	);
	await page
		.getByRole("button", { name: /Switch to (light|dark) mode/ })
		.click();
	await expect(page.locator("html")).toHaveAttribute(
		"data-theme",
		startingTheme || "dark",
	);

	await page.setViewportSize({ height: 844, width: 390 });
	await OpenRoute(page, "/", "Command Centre");
	await page.getByRole("button", { name: "Open Navigation" }).click();
	await page
		.getByRole("button", { name: "Close Navigation" })
		.first()
		.click({ position: { x: 380, y: 422 } });
	await page.getByRole("button", { name: "Open Navigation" }).click();
	await page.getByRole("button", { name: "Close Navigation" }).last().click();
	await page.getByRole("button", { name: "Open Navigation" }).click();
	await page.keyboard.press("Escape");
	await page.getByRole("button", { name: "Open Navigation" }).click();
	await page
		.getByRole("navigation", { name: "Main Navigation" })
		.getByRole("link", { exact: true, name: "Evidence" })
		.click();
	await expect(page).toHaveURL(/\/documents$/);
	await WaitForApiQuiet(page);
	await expect(
		page.getByRole("button", { name: "Open Navigation" }),
	).toBeVisible();
	await ExpectNoHorizontalOverflow(page);
	await page.screenshot({
		fullPage: true,
		path: testInfo.outputPath("mobile-evidence.png"),
	});
});

test("sends a live cited question, renders the answer and uses copy and history controls", async ({
	page,
}, testInfo) => {
	await OpenRoute(page, "/chat", "Ask With Citations");
	const prompts = [
		"Which assets are high risk and what evidence supports it?",
		"Summarise open compliance gaps by asset.",
		"What inspections or events mention pump seal failure?",
		"Which corrective actions should be handled first?",
	];
	const questionField = page.getByRole("textbox", { name: "Question" });
	for (const prompt of prompts) {
		await page.getByRole("button", { exact: true, name: prompt }).click();
		await expect(questionField).toHaveText(prompt);
	}
	const question = prompts.at(-1) || "Which actions should be handled first?";
	const responsePromise = page.waitForResponse(
		(response) =>
			response.url() === `${testApiOrigin}/chat` &&
			response.request().method() === "POST",
		{ timeout: 180_000 },
	);
	await page.getByRole("button", { name: "Ask With Citations" }).click();
	const response = await responsePromise;
	expect(response.status()).toBe(200);
	const result = await response.json();
	expect(result.answer.length).toBeGreaterThan(40);
	expect(result.confidence).toBeGreaterThan(0);
	expect(result.citations.length).toBeGreaterThan(0);
	await expect(page.getByText(result.answer)).toBeVisible({ timeout: 30_000 });
	await expect(
		page.getByText("Citations", { exact: true }).first(),
	).toBeVisible();

	await page.getByRole("button", { name: "Copy Answer" }).click();
	await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();
	const copied = await page.evaluate(() => navigator.clipboard.readText());
	expect(copied).toBe(result.answer);

	await questionField.fill("temporary edit");
	await page
		.getByRole("button", { name: new RegExp(EscapeRegExp(question)) })
		.last()
		.click();
	await expect(questionField).toHaveText(question);
	await ExpectNoHorizontalOverflow(page);
	await page.screenshot({
		fullPage: true,
		path: testInfo.outputPath("chat.png"),
	});
});

test("selects every asset and uses search, action, timeline and export controls", async ({
	page,
	request,
}, testInfo) => {
	const assetsResponse = await request.get(`${testApiOrigin}/assets`);
	expect(assetsResponse.ok()).toBeTruthy();
	const assets: Array<{ id: string; name: string }> =
		await assetsResponse.json();
	expect(assets.length).toBeGreaterThan(0);
	await OpenRoute(page, "/assets", "Asset Risk Register");

	await page.getByLabel("Search assets").fill("no-such-asset");
	await expect(page.getByText(`0/${assets.length}`).first()).toBeVisible();
	await page.getByLabel("Search assets").fill("");

	for (let assetIndex = 0; assetIndex < assets.length; assetIndex += 1) {
		const asset = assets[assetIndex];
		const riskResponse =
			assetIndex === 0
				? null
				: page.waitForResponse(
						(response) =>
							response.url() ===
							`${testApiOrigin}/assets/${encodeURIComponent(asset.id)}/risk-summary`,
					);
		await page
			.getByRole("button", { name: new RegExp(EscapeRegExp(asset.name)) })
			.click();
		if (riskResponse) await riskResponse;
		await expect(page.getByRole("heading", { name: asset.name })).toBeVisible();

		const actionCheckboxes = page.getByRole("checkbox");
		for (let index = 0; index < (await actionCheckboxes.count()); index += 1) {
			await actionCheckboxes.nth(index).click();
			await expect(actionCheckboxes.nth(index)).toHaveAttribute(
				"aria-checked",
				"true",
			);
		}

		const timelineResponse = await request.get(
			`${testApiOrigin}/assets/${encodeURIComponent(asset.id)}/timeline`,
		);
		const timeline: Array<{ event_type: string }> =
			await timelineResponse.json();
		const timelineTypes = [
			...new Set(timeline.map((event) => event.event_type)),
		];
		await page.getByRole("button", { exact: true, name: "Timeline" }).click();
		for (const timelineType of timelineTypes) {
			await page
				.getByRole("button", {
					exact: true,
					name: FormatDisplayLabel(timelineType),
				})
				.click();
		}
		await page.getByRole("button", { exact: true, name: "All" }).click();
	}

	const downloadPromise = page.waitForEvent("download");
	await page.getByRole("button", { name: "Export Pack" }).click();
	const download = await downloadPromise;
	expect(download.suggestedFilename()).toMatch(/\.md$/);
	expect(await download.path()).toBeTruthy();
	await expect(page.getByText("Evidence pack exported")).toBeVisible();
	await ExpectNoHorizontalOverflow(page);
	await page.screenshot({
		fullPage: true,
		path: testInfo.outputPath("assets.png"),
	});
});

test("renders and operates the complete evidence graph", async ({
	page,
	request,
}, testInfo) => {
	await OpenRoute(page, "/graph", "Evidence Graph");
	const jsonExportResponse = await request.get(
		`${testApiOrigin}/graph/export?format=json`,
	);
	expect(jsonExportResponse.ok()).toBeTruthy();
	const jsonExport = await jsonExportResponse.json();
	expect(jsonExport.filename).toMatch(/\.json$/);
	expect(jsonExport.content).toContain("edge_audit");
	const cypherExportResponse = await request.get(
		`${testApiOrigin}/graph/export?format=cypher`,
	);
	expect(cypherExportResponse.ok()).toBeTruthy();
	const cypherExport = await cypherExportResponse.json();
	expect(cypherExport.filename).toMatch(/\.cypher$/);
	expect(cypherExport.content).toContain("EvidenceNode");
	const graphNodes = page.locator(".react-flow__node");
	const graphEdges = page.locator(".react-flow__edge-path");
	await expect(graphNodes.first()).toBeVisible({ timeout: 30_000 });
	expect(await graphNodes.count()).toBeGreaterThan(0);
	expect(await graphEdges.count()).toBeGreaterThan(0);
	await expect(page.getByText("No Node Selected")).toBeVisible();

	const nodesToInspect = Math.min(await graphNodes.count(), 10);
	for (let index = 0; index < nodesToInspect; index += 1) {
		await graphNodes.nth(index).click();
		await expect(page.getByText("No Node Selected")).toHaveCount(0);
	}
	await page.getByRole("button", { name: "Focus Node" }).click();
	await expect(page.getByRole("button", { name: "Focused" })).toBeVisible();
	await page.getByRole("button", { name: "Focused" }).click();
	await page.getByRole("button", { exact: true, name: "Fit" }).click();

	for (const controlName of ["Zoom in", "Zoom out", "Fit view"]) {
		const control = page.getByRole("button", { name: controlName });
		if (await control.count()) await control.click();
	}

	const typeCombobox = page.getByRole("combobox", { name: "Type" });
	await typeCombobox.click();
	const optionNames = await page
		.getByRole("option")
		.evaluateAll((options) =>
			options.map((option) => option.textContent?.trim() || ""),
		);
	await page.keyboard.press("Escape");
	for (const optionName of optionNames) {
		await typeCombobox.click();
		await page.getByRole("option", { exact: true, name: optionName }).click();
	}
	await page.getByLabel("Search graph").fill("definitely-no-such-node");
	await expect(page.getByText("No Graph Nodes")).toBeVisible();
	await page.getByRole("button", { name: "Reset" }).click();
	await expect(graphNodes.first()).toBeVisible();
	await ExpectNoHorizontalOverflow(page);
	await page.screenshot({
		fullPage: true,
		path: testInfo.outputPath("graph.png"),
	});
});

test("runs both compliance controls, filters findings, checks actions and exports evidence", async ({
	page,
}, testInfo) => {
	await OpenRoute(page, "/compliance", "Compliance Review");
	await page
		.getByLabel("Compliance Request")
		.fill(
			"Summarise high severity safety compliance gaps with cited evidence.",
		);
	let runButtons = page.getByRole("button", { name: "Run Check" });
	expect(await runButtons.count()).toBe(2);
	let responsePromise = page.waitForResponse(
		(response) => response.url() === `${testApiOrigin}/compliance/check`,
		{ timeout: 180_000 },
	);
	await runButtons.first().click();
	let response = await responsePromise;
	expect(response.status()).toBe(200);
	let result = await response.json();
	expect(result.summary.length).toBeGreaterThan(20);
	expect(result.gaps.length).toBeGreaterThan(0);
	await expect(page.getByText(result.summary)).toBeVisible();

	await page
		.getByLabel("Compliance Request")
		.fill("List the most urgent open compliance actions by asset.");
	runButtons = page.getByRole("button", { name: "Run Check" });
	responsePromise = page.waitForResponse(
		(response) => response.url() === `${testApiOrigin}/compliance/check`,
		{ timeout: 180_000 },
	);
	await runButtons.last().click();
	response = await responsePromise;
	expect(response.status()).toBe(200);
	result = await response.json();
	await expect(page.getByText(result.summary)).toBeVisible();

	const actionCheckboxes = page.getByRole("checkbox");
	for (let index = 0; index < (await actionCheckboxes.count()); index += 1) {
		await actionCheckboxes.nth(index).click();
		await expect(actionCheckboxes.nth(index)).toHaveAttribute(
			"aria-checked",
			"true",
		);
	}
	await expect(page.getByText("Actions Ticked")).toBeVisible();

	await page.getByLabel("Search gaps").fill("no-matching-gap");
	await expect(page.getByText("No Matching Gaps")).toBeVisible();
	await page.getByLabel("Search gaps").fill("");
	const checkedGaps = result.gaps as Array<{
		severity: string;
		status: string;
	}>;
	const filterLabels: string[] = [
		...new Set(
			checkedGaps.flatMap((gap) => [
				FormatDisplayLabel(gap.severity),
				FormatDisplayLabel(gap.status),
			]),
		),
	];
	for (const label of filterLabels) {
		const controls = page.getByRole("button", { exact: true, name: label });
		for (let index = 0; index < (await controls.count()); index += 1) {
			await controls.nth(index).click();
		}
	}
	const allFilters = page.getByRole("button", { exact: true, name: "All" });
	for (let index = 0; index < (await allFilters.count()); index += 1) {
		await allFilters.nth(index).click();
	}

	const downloadPromise = page.waitForEvent("download");
	await page.getByRole("button", { name: "Export Pack" }).click();
	const download = await downloadPromise;
	expect(download.suggestedFilename()).toMatch(/\.md$/);
	expect(await download.path()).toBeTruthy();
	await expect(page.getByText("Evidence pack exported")).toBeVisible();
	await ExpectNoHorizontalOverflow(page);
	await page.screenshot({
		fullPage: true,
		path: testInfo.outputPath("compliance.png"),
	});
});

test("generates a live RCA, uses every action checkbox and invokes printing", async ({
	page,
}, testInfo) => {
	await OpenRoute(page, "/rca", "Root Cause Analysis");
	const assetCombobox = page.getByRole("combobox", { name: "Asset" });
	await assetCombobox.click();
	const assetOptions = await page
		.getByRole("option")
		.evaluateAll((options) =>
			options.map((option) => option.textContent?.trim() || ""),
		);
	await page.keyboard.press("Escape");
	expect(assetOptions.length).toBeGreaterThan(0);
	for (const optionName of assetOptions) {
		await assetCombobox.click();
		await page.getByRole("option", { exact: true, name: optionName }).click();
	}
	await assetCombobox.click();
	await page
		.getByRole("option", { exact: true, name: assetOptions[0] })
		.click();
	const symptom =
		"Seal leakage increased after the latest maintenance intervention.";
	await page.getByLabel("Symptom").fill(symptom);
	const responsePromise = page.waitForResponse(
		(response) => response.url() === `${testApiOrigin}/rca`,
		{ timeout: 180_000 },
	);
	await page.getByRole("button", { name: "Generate RCA" }).click();
	const response = await responsePromise;
	expect(response.status()).toBe(200);
	const report = await response.json();
	expect(report.likely_causes.length).toBeGreaterThan(0);
	expect(report.recommended_checks.length).toBeGreaterThan(0);
	expect(report.preventive_actions.length).toBeGreaterThan(0);
	expect(report.supporting_evidence.length).toBeGreaterThan(0);
	await expect(page.getByText("Likely Causes")).toBeVisible();
	await expect(page.getByText("Supporting Evidence")).toBeVisible();

	const actionCheckboxes = page.getByRole("checkbox");
	for (let index = 0; index < (await actionCheckboxes.count()); index += 1) {
		await actionCheckboxes.nth(index).click();
		await expect(actionCheckboxes.nth(index)).toHaveAttribute(
			"aria-checked",
			"true",
		);
	}
	await page.evaluate(() => {
		window.print = () => {
			document.documentElement.dataset.printInvoked = "true";
		};
	});
	await page.getByRole("button", { name: "Print Report" }).click();
	await expect(page.locator("html")).toHaveAttribute(
		"data-print-invoked",
		"true",
	);
	await ExpectNoHorizontalOverflow(page);
	await page.screenshot({
		fullPage: true,
		path: testInfo.outputPath("rca.png"),
	});
});

test("confirms destructive clear only in the isolated workspace and verifies empty states", async ({
	page,
	request,
}, testInfo) => {
	await OpenRoute(page, "/documents", "Evidence Workspace");
	await page.getByRole("button", { exact: true, name: "Clear" }).click();
	const clearResponsePromise = page.waitForResponse(
		(response) =>
			response.url() === `${testApiOrigin}/workspace` &&
			response.request().method() === "DELETE",
	);
	await page
		.getByRole("dialog", { name: "Clear Workspace" })
		.getByRole("button", { name: "Clear Workspace" })
		.click();
	expect((await clearResponsePromise).status()).toBe(200);
	await expect(page.getByText("Workspace cleared")).toBeVisible();
	await expect(page.getByText("No Source Files")).toBeVisible();
	await WaitForApiQuiet(page);

	for (const endpoint of [
		"documents",
		"entities",
		"assets",
		"compliance/gaps",
	]) {
		const response = await request.get(`${testApiOrigin}/${endpoint}`);
		expect(response.ok()).toBeTruthy();
		expect(await response.json()).toEqual([]);
	}

	await OpenRoute(page, "/", "Command Centre");
	await expect(page.getByText("Run Sequence")).toBeVisible();
	await expect(
		page.getByRole("button", { exact: true, name: "Select Folder" }),
	).toHaveCount(0);
	const dropZone = page.getByRole("button", { name: "Drop plant files here" });
	const chooser = page.waitForEvent("filechooser");
	await dropZone.click();
	await (
		await chooser
	).setFiles({
		buffer: Buffer.from("dashboard unsupported file"),
		mimeType: "application/octet-stream",
		name: "dashboard-unsupported.bin",
	});
	await page
		.getByRole("button", { name: "Remove dashboard-unsupported.bin" })
		.click();
	const emptyFilesChooser = page.waitForEvent("filechooser");
	await page
		.getByRole("button", { exact: true, name: "Upload Multiple Files" })
		.click();
	await (await emptyFilesChooser).setFiles([]);
	const dashboardFilesChooser = page.waitForEvent("filechooser");
	await page
		.getByRole("button", { exact: true, name: "Upload Multiple Files" })
		.click();
	await (await dashboardFilesChooser).setFiles(sampleFiles);
	await expect(
		page.getByText(`${sampleFileCount} selected, 0 need attention.`),
	).toBeVisible();
	const dashboardUploadResponsePromise = page.waitForResponse(
		(response) =>
			response.url() === `${testApiOrigin}/documents/upload-batch` &&
			response.request().method() === "POST",
		{ timeout: 180_000 },
	);
	const dashboardAnalysisResponsePromise = page.waitForResponse(
		(response) =>
			response.url() === `${testApiOrigin}/analysis/regenerate` &&
			response.request().method() === "POST",
		{ timeout: 240_000 },
	);
	await page.getByRole("button", { exact: true, name: "Upload" }).click();
	const dashboardUploadResponse = await dashboardUploadResponsePromise;
	expect(dashboardUploadResponse.status()).toBe(200);
	const dashboardUploadResult = await dashboardUploadResponse.json();
	expect(dashboardUploadResult.uploaded_count).toBe(sampleFileCount);
	expect(dashboardUploadResult.failed_count).toBe(0);
	const dashboardAnalysisResponse = await dashboardAnalysisResponsePromise;
	expect(dashboardAnalysisResponse.status()).toBe(200);
	const dashboardAnalysis = await dashboardAnalysisResponse.json();
	expect(dashboardAnalysis.analysis_status).toBe("complete");
	await expect(
		page.getByText(
			"Operational intelligence built only from uploaded evidence.",
		),
	).toBeVisible({ timeout: 30_000 });
	await ExpectNoHorizontalOverflow(page);
	await page.screenshot({
		fullPage: true,
		path: testInfo.outputPath("dashboard-auto-analysis.png"),
	});
});

async function OpenRoute(page: Page, route: string, heading: string) {
	await page.goto(route, { waitUntil: "domcontentloaded" });
	await expect(page.getByRole("heading", { name: heading })).toBeVisible();
	await WaitForApiQuiet(page);
}

async function WaitForApiQuiet(page: Page) {
	let quietSince = 0;
	await expect
		.poll(
			() => {
				if ((apiRequestsByPage.get(page)?.size ?? 0) > 0) {
					quietSince = 0;
					return false;
				}
				if (!quietSince) quietSince = Date.now();
				return Date.now() - quietSince >= 750;
			},
			{ intervals: [50], timeout: 30_000 },
		)
		.toBe(true);
}

async function ExpectNoHorizontalOverflow(page: Page) {
	const overflow = await page.evaluate(
		() =>
			document.documentElement.scrollWidth -
			document.documentElement.clientWidth,
	);
	expect(overflow).toBeLessThanOrEqual(1);
}

async function AttachDiagnostics(testInfo: TestInfo, diagnostics: string[]) {
	await testInfo.attach("browser-diagnostics", {
		body: Buffer.from(diagnostics.join("\n") || "No unexpected diagnostics."),
		contentType: "text/plain",
	});
}

function EscapeRegExp(value: string) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
