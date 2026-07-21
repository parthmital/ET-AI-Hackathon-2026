import {
	expect,
	test,
	type APIRequestContext,
	type Page,
} from "@playwright/test";
import { readdirSync } from "node:fs";
import path from "node:path";
import { FormatDisplayLabel } from "../lib/format";
import type { Asset, TimelineEvent } from "../lib/types";
import {
	CollectBrowserDiagnostics,
	ExpectNoHorizontalOverflow,
	NavigateByRail,
	OpenRoute,
	Pause,
	SmoothPointer,
	SmoothScrollBy,
	SmoothScrollIntoView,
	WaitForApiResponse,
	WaitForSkeletonsToSettle,
} from "./demo-helpers";

const ApiOrigin = "http://127.0.0.1:8000";
const SampleDataDirectory = path.resolve(__dirname, "../../sample_data");
const SampleFiles = readdirSync(SampleDataDirectory)
	.map((name) => path.join(SampleDataDirectory, name))
	.sort();
const SampleFileCount = SampleFiles.length;
const diagnosticsByPage = new WeakMap<Page, string[]>();

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ request }) => {
	const healthResponse = await request.get(`${ApiOrigin}/health`);
	expect(healthResponse.ok()).toBeTruthy();
	const health = await healthResponse.json();
	expect(health.status).toBe("OK");
	expect(health.llm_configured).toBe(true);
	expect(health.ocr.available).toBe(true);

	const clearResponse = await request.delete(`${ApiOrigin}/workspace`);
	expect(clearResponse.ok()).toBeTruthy();
});

test.beforeEach(async ({ page }) => {
	await page.addInitScript(() => {
		window.localStorage.setItem("industrial-ops-brain-theme", "dark");
	});
	diagnosticsByPage.set(page, CollectBrowserDiagnostics(page));
});

test.afterEach(async ({ page }, testInfo) => {
	const diagnostics = diagnosticsByPage.get(page) ?? [];
	const unexpectedDiagnostics = FilterExpectedResetDiagnostics(
		diagnostics,
		testInfo.title,
	);
	await testInfo.attach("browser-diagnostics", {
		body: Buffer.from(diagnostics.join("\n") || "No unexpected diagnostics."),
		contentType: "text/plain",
	});
	expect(unexpectedDiagnostics, "Unexpected browser diagnostics").toEqual([]);
});

function FilterExpectedResetDiagnostics(
	diagnostics: string[],
	testTitle: string,
) {
	if (!testTitle.includes("isolated clear")) return diagnostics;
	const hasComplianceRefreshFailure = diagnostics.some(
		(diagnostic) =>
			diagnostic.includes("Network request failed") &&
			diagnostic.includes("path: /compliance/gaps"),
	);
	if (!hasComplianceRefreshFailure) return diagnostics;
	return diagnostics.filter(
		(diagnostic) =>
			!(
				diagnostic.includes("api.request.network_error") ||
				(diagnostic.includes("Network request failed") &&
					diagnostic.includes("path: /compliance/gaps"))
			),
	);
}

test("polished screen recorded demo uses the real app and real sample_data", async ({
	page,
	request,
}, testInfo) => {
	const pointer = new SmoothPointer(page);

	await OpenRoute(page, "/", "Command Centre");
	await expect(page.getByText("Run Sequence")).toBeVisible();
	await Pause(page, 900);
	await SmoothScrollIntoView(
		page,
		page.getByRole("heading", { name: "Upload Evidence" }),
	);
	await Pause(page, 600);

	await NavigateByRail(page, pointer, "Evidence", "Evidence Workspace");
	await expect(page.getByText("0 Ready")).toBeVisible();
	const uploadChooser = page.waitForEvent("filechooser");
	await pointer.click(
		page.getByRole("button", { exact: true, name: "Upload Multiple Files" }),
	);
	await (await uploadChooser).setFiles(SampleFiles);
	await expect(
		page.getByText(`${SampleFileCount} selected, 0 need attention.`),
	).toBeVisible();
	await SmoothScrollBy(page, 420);
	await Pause(page, 800);

	const uploadResponsePromise = WaitForApiResponse(
		page,
		"/documents/upload-batch",
		"POST",
	);
	await pointer.click(
		page.getByRole("button", { exact: true, name: "Upload" }),
	);
	const uploadResponse = await uploadResponsePromise;
	expect(uploadResponse.status()).toBe(200);
	const uploadResult = await uploadResponse.json();
	expect(uploadResult.uploaded_count).toBe(SampleFileCount);
	expect(uploadResult.failed_count).toBe(0);
	await expect(
		page.getByText(`Indexed: ${SampleFileCount}. Duplicates: 0. Failed: 0.`),
	).toBeVisible();
	await Pause(page, 800);

	const documentsResponse = await request.get(`${ApiOrigin}/documents`);
	expect(documentsResponse.ok()).toBeTruthy();
	const documents = await documentsResponse.json();
	expect(documents).toHaveLength(SampleFileCount);
	expect(
		documents.some(
			(document: { document_type: string; ocr_used: boolean }) =>
				document.document_type === "PDF" && document.ocr_used,
		),
	).toBeTruthy();

	const extractionResponsePromise = WaitForApiResponse(
		page,
		"/analysis/regenerate",
		"POST",
	);
	const extractionButton = page.getByRole("button", { name: "Run Extraction" });
	await expect(extractionButton).toBeEnabled({ timeout: 60_000 });
	await SmoothScrollIntoView(page, extractionButton);
	await pointer.click(extractionButton);
	const extractionResponse = await extractionResponsePromise;
	expect(extractionResponse.status()).toBe(200);
	const extraction = await extractionResponse.json();
	expect(extraction.analysis_status).toBe("complete");
	expect(extraction.assets).toBeGreaterThan(0);
	expect(extraction.timeline_events).toBeGreaterThan(0);
	expect(extraction.compliance_gaps).toBeGreaterThan(0);
	await expect(page.getByText(/Extraction complete:/)).toBeVisible();

	const entitiesResponse = await request.get(`${ApiOrigin}/entities`);
	expect(entitiesResponse.ok()).toBeTruthy();
	const entities: Array<{ value: string }> = await entitiesResponse.json();
	const entitySearchValue =
		entities.find((entity) => entity.value.includes("P-101"))?.value ??
		entities[0]?.value ??
		"P-101";
	await SmoothScrollIntoView(
		page,
		page.getByRole("heading", { name: "Extracted Signals" }),
	);
	await page.getByLabel("Search evidence").fill(entitySearchValue);
	await expect(page.getByText(/matching/i).first()).toBeVisible();
	await Pause(page, 650);
	await page.getByLabel("Search evidence").fill("");

	await NavigateByRail(page, pointer, "Command Centre", "Command Centre");
	await expect(
		page.getByText(
			"Operational intelligence built only from uploaded evidence.",
		),
	).toBeVisible();
	await Pause(page, 900);
	await SmoothScrollBy(page, 520);
	await expect(page.getByRole("heading", { name: "Risk Board" })).toBeVisible();
	await Pause(page, 700);

	await NavigateByRail(page, pointer, "Ask", "Ask With Citations");
	const question = "What evidence explains the P-101 seal failure?";
	await page.getByRole("textbox", { name: "Question" }).fill(question);
	await Pause(page, 650);
	const chatResponsePromise = WaitForApiResponse(page, "/chat", "POST");
	await pointer.click(page.getByRole("button", { name: "Ask With Citations" }));
	await expect(page.getByText("Retrieving evidence")).toBeVisible();
	const chatResponse = await chatResponsePromise;
	expect(chatResponse.status()).toBe(200);
	const chatResult = await chatResponse.json();
	expect(chatResult.answer.length).toBeGreaterThan(40);
	expect(chatResult.citations.length).toBeGreaterThan(0);
	await expect(page.getByText("Answer", { exact: true })).toBeVisible();
	await expect(
		page
			.getByLabel("Citations")
			.getByText(/Page 1/)
			.first(),
	).toBeVisible();
	await Pause(page, 900);
	await pointer.click(page.getByRole("button", { name: "Copy Answer" }));
	await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();
	await SmoothScrollBy(page, 430);
	await expect(
		page.getByRole("heading", { name: "Graph Paths" }),
	).toBeVisible();
	await Pause(page, 800);

	const assets = await LoadAssets(request);
	const preferredAsset = PickPreferredAsset(assets);
	await NavigateByRail(page, pointer, "Assets", "Asset Risk Register");
	await page.getByLabel("Search assets").fill(preferredAsset.id);
	await pointer.click(
		page.getByRole("button", {
			name: new RegExp(EscapeRegExp(preferredAsset.name)),
		}),
	);
	await expect(
		page
			.getByRole("heading", {
				name: new RegExp(EscapeRegExp(preferredAsset.id)),
			})
			.first(),
	).toBeVisible();
	await page.getByLabel("Search assets").fill("");
	const assetCheckboxes = page.getByRole("checkbox");
	if ((await assetCheckboxes.count()) > 0) {
		await pointer.click(assetCheckboxes.first());
		await expect(assetCheckboxes.first()).toHaveAttribute(
			"aria-checked",
			"true",
		);
	}
	for (const tab of ["Timeline", "Gaps", "Trace", "Overview"]) {
		const tabButton = page.getByRole("button", { exact: true, name: tab });
		if ((await tabButton.count()) > 0) {
			await pointer.click(tabButton);
			await Pause(page, 500);
		}
	}
	const assetDownload = page.waitForEvent("download");
	await pointer.click(page.getByRole("button", { name: "Export Pack" }));
	expect((await assetDownload).suggestedFilename()).toMatch(/\.md$/);
	await expect(page.getByText("Evidence pack exported")).toBeVisible();
	await Pause(page, 750);

	await NavigateByRail(page, pointer, "Graph", "Evidence Graph");
	await expect(page.getByTestId("evidence-graph")).toBeVisible();
	const preferredGraphNode = page
		.locator("[aria-label^='Graph node']")
		.filter({ hasText: preferredAsset.id })
		.first();
	if ((await preferredGraphNode.count()) > 0) {
		await pointer.click(preferredGraphNode);
	} else {
		await pointer.click(page.locator("[aria-label^='Graph node']").first());
	}
	await expect(page.getByText("No Node Selected")).toHaveCount(0);
	await Pause(page, 700);
	const focusNode = page.getByRole("button", { name: "Focus Node" });
	if (await focusNode.isEnabled()) {
		await pointer.click(focusNode);
		await expect(page.getByRole("button", { name: "Focused" })).toBeVisible();
	}
	const graphEdge = page.locator("[aria-label^='Graph edge']").first();
	if ((await graphEdge.count()) > 0) {
		await pointer.moveTo(graphEdge);
		await graphEdge.click({ force: true });
		await expect(page.getByText(/Page \d+/).first()).toBeVisible();
	}
	await pointer.click(page.getByRole("button", { exact: true, name: "Fit" }));
	const graphDownload = page.waitForEvent("download");
	await pointer.click(page.getByRole("button", { exact: true, name: "JSON" }));
	expect((await graphDownload).suggestedFilename()).toMatch(/\.json$/);
	await Pause(page, 750);

	await NavigateByRail(page, pointer, "Compliance", "Compliance Review");
	await page
		.getByLabel("Compliance Request")
		.fill(
			"Summarise high severity safety compliance gaps with cited evidence.",
		);
	await Pause(page, 650);
	const complianceResponsePromise = WaitForApiResponse(
		page,
		"/compliance/check",
		"POST",
	);
	await pointer.click(page.getByRole("button", { name: "Run Check" }).first());
	await expect(
		page.getByRole("button", { name: "Checking" }).first(),
	).toBeVisible();
	const complianceResponse = await complianceResponsePromise;
	expect(complianceResponse.status()).toBe(200);
	const complianceResult = await complianceResponse.json();
	expect(complianceResult.summary.length).toBeGreaterThan(20);
	await expect(page.getByText(complianceResult.summary)).toBeVisible();
	const complianceCheckboxes = page.getByRole("checkbox");
	if ((await complianceCheckboxes.count()) > 0) {
		await pointer.click(complianceCheckboxes.first());
		await expect(page.getByText("Actions Ticked")).toBeVisible();
	}
	await ClickComplianceExport(page, pointer);
	await Pause(page, 800);

	await NavigateByRail(page, pointer, "RCA", "Root Cause Analysis");
	await SelectAssetOption(page, preferredAsset.id);
	await page
		.getByLabel("Symptom")
		.fill("Seal leakage after high vibration alarms");
	await Pause(page, 700);
	const rcaResponsePromise = WaitForApiResponse(page, "/rca", "POST");
	await pointer.click(page.getByRole("button", { name: "Generate RCA" }));
	await expect(page.getByRole("button", { name: "Generating" })).toBeVisible();
	const rcaResponse = await rcaResponsePromise;
	expect(rcaResponse.status()).toBe(200);
	const rcaReport = await rcaResponse.json();
	expect(rcaReport.likely_causes.length).toBeGreaterThan(0);
	expect(rcaReport.supporting_evidence.length).toBeGreaterThan(0);
	await expect(
		page.getByRole("heading", { name: "Likely Causes" }),
	).toBeVisible();
	await expect(
		page.getByRole("heading", { name: "Supporting Evidence" }),
	).toBeVisible();
	const rcaCheckboxes = page.getByRole("checkbox");
	if ((await rcaCheckboxes.count()) > 0)
		await pointer.click(rcaCheckboxes.first());
	await SmoothScrollIntoView(
		page,
		page.getByRole("heading", { name: "RCA Brief" }),
		0.18,
	);
	await Pause(page, 1200);

	await ExpectNoHorizontalOverflow(page);
	await testInfo.attach("coverage-report", {
		body: Buffer.from(
			[
				"Main demo uses real app services and uploaded every file from sample_data/.",
				"Routes covered: /, /documents, /chat, /assets, /graph, /compliance, /rca.",
				"Workflow covered: real upload, OCR/parser evidence, live extraction, cited chat, asset review, graph evidence, compliance check, exports, and RCA.",
			].join("\n"),
		),
		contentType: "text/plain",
	});
});

test("complete real route and non destructive control coverage, then isolated clear", async ({
	page,
	request,
}) => {
	const pointer = new SmoothPointer(page);

	await OpenRoute(page, "/", "Command Centre");
	for (const [label, heading] of [
		["Evidence", "Evidence Workspace"],
		["Ask", "Ask With Citations"],
		["Assets", "Asset Risk Register"],
		["Graph", "Evidence Graph"],
		["Compliance", "Compliance Review"],
		["RCA", "Root Cause Analysis"],
		["Command Centre", "Command Centre"],
	] as const) {
		await NavigateByRail(page, pointer, label, heading);
	}

	await page
		.getByRole("button", { name: /Switch to light mode|Switch to dark mode/ })
		.click();
	await page
		.getByRole("button", { name: /Switch to light mode|Switch to dark mode/ })
		.click();

	await OpenRoute(page, "/", "Command Centre");
	const mainLinkCount = await page.locator("main a").count();
	for (let index = 0; index < mainLinkCount; index += 1) {
		await OpenRoute(page, "/", "Command Centre");
		const link = page.locator("main a").nth(index);
		const href = await link.getAttribute("href");
		expect(href).toBeTruthy();
		await link.click();
		await expect(page).toHaveURL(new RegExp(`${EscapeRegExp(href || "/")}$`));
		await WaitForSkeletonsToSettle(page);
	}

	await NavigateByRail(page, pointer, "Evidence", "Evidence Workspace");
	const unsupportedChooser = page.waitForEvent("filechooser");
	await page.getByRole("button", { name: "Drop plant files here" }).click();
	await (
		await unsupportedChooser
	).setFiles({
		buffer: Buffer.from("not an industrial document"),
		mimeType: "application/octet-stream",
		name: "unsupported.bin",
	});
	await expect(page.getByText("Unsupported File Type")).toBeVisible();
	await page.getByRole("button", { name: "Remove unsupported.bin" }).click();

	const chooser = page.waitForEvent("filechooser");
	await page
		.getByRole("button", { exact: true, name: "Upload Multiple Files" })
		.click();
	await (await chooser).setFiles(SampleFiles[0]);
	const duplicateResponsePromise = WaitForApiResponse(
		page,
		"/documents/upload-batch",
		"POST",
	);
	await page.getByRole("button", { exact: true, name: "Upload" }).click();
	const duplicateResult = await (await duplicateResponsePromise).json();
	expect(duplicateResult.duplicate_count).toBe(1);
	await expect(
		page.getByText("Indexed: 0. Duplicates: 1. Failed: 0."),
	).toBeVisible();

	const extractionButton = page.getByRole("button", { name: "Run Extraction" });
	await expect(extractionButton).toBeEnabled({ timeout: 60_000 });
	await extractionButton.click();
	await expect(page.getByText(/Extraction complete:/)).toBeVisible({
		timeout: 240_000,
	});
	await page.getByRole("button", { exact: true, name: "Clear" }).click();
	await expect(
		page.getByRole("dialog", { name: "Clear Workspace" }),
	).toBeVisible();
	await page.getByRole("button", { name: "Cancel" }).click();
	await expect(
		page.getByRole("dialog", { name: "Clear Workspace" }),
	).toHaveCount(0);

	await ExerciseEntityFilters(page);
	await ExerciseChatControls(page);
	await ExerciseAssetControls(page, request);
	await ExerciseGraphControls(page);
	await ExerciseComplianceControls(page);
	await ExerciseRcaControls(page, request);
	await ExerciseMobileNavigation(page);

	await NavigateByRail(page, pointer, "Evidence", "Evidence Workspace");
	await page.getByRole("button", { exact: true, name: "Clear" }).click();
	const clearResponsePromise = WaitForApiResponse(page, "/workspace", "DELETE");
	await page
		.getByRole("dialog", { name: "Clear Workspace" })
		.getByRole("button", { name: "Clear Workspace" })
		.click();
	expect((await clearResponsePromise).status()).toBe(200);
	await expect(page.getByText("Workspace cleared")).toBeVisible();
	await expect(page.getByText("No Source Files")).toBeVisible();

	for (const endpoint of [
		"documents",
		"entities",
		"assets",
		"compliance/gaps",
	]) {
		const response = await request.get(`${ApiOrigin}/${endpoint}`);
		expect(response.ok()).toBeTruthy();
		expect(await response.json()).toEqual([]);
	}

	await OpenRoute(page, "/", "Command Centre");
	const dashboardChooser = page.waitForEvent("filechooser");
	await page
		.getByRole("button", { exact: true, name: "Upload Multiple Files" })
		.click();
	await (await dashboardChooser).setFiles(SampleFiles);
	await expect(
		page.getByText(`${SampleFileCount} selected, 0 need attention.`),
	).toBeVisible();
	const dashboardUploadResponsePromise = WaitForApiResponse(
		page,
		"/documents/upload-batch",
		"POST",
	);
	const dashboardAnalysisResponsePromise = WaitForApiResponse(
		page,
		"/analysis/regenerate",
		"POST",
	);
	await page.getByRole("button", { exact: true, name: "Upload" }).click();
	const dashboardUploadResponse = await dashboardUploadResponsePromise;
	expect(dashboardUploadResponse.status()).toBe(200);
	const dashboardUploadResult = await dashboardUploadResponse.json();
	expect(dashboardUploadResult.uploaded_count).toBe(SampleFileCount);
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
});

async function ExerciseEntityFilters(page: Page) {
	const entityType = page.getByRole("combobox", { name: "Filter entity type" });
	await entityType.click();
	const optionNames = await page
		.getByRole("option")
		.evaluateAll((options) =>
			options.map((option) => option.textContent?.trim() || "").filter(Boolean),
		);
	await page.keyboard.press("Escape");
	for (const optionName of optionNames.slice(0, 8)) {
		await entityType.click();
		await page.getByRole("option", { exact: true, name: optionName }).click();
	}
	await page.getByLabel("Search evidence").fill("P-101");
	await expect(page.getByText(/matching/i).first()).toBeVisible();
	await page.getByLabel("Search evidence").fill("");
}

async function ExerciseChatControls(page: Page) {
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
	const responsePromise = WaitForApiResponse(page, "/chat", "POST");
	await page.getByRole("button", { name: "Ask With Citations" }).click();
	const response = await responsePromise;
	expect(response.status()).toBe(200);
	const result = await response.json();
	expect(result.answer.length).toBeGreaterThan(40);
	expect(result.citations.length).toBeGreaterThan(0);
	await page.getByRole("button", { name: "Copy Answer" }).click();
	await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();
	await page
		.getByRole("button", { name: prompts.at(-1) ?? "" })
		.last()
		.click();
	await expect(questionField).toHaveText(prompts.at(-1) ?? "");
}

async function ExerciseAssetControls(page: Page, request: APIRequestContext) {
	const assets = await LoadAssets(request);
	await OpenRoute(page, "/assets", "Asset Risk Register");
	await page.getByLabel("Search assets").fill("no-such-asset");
	await expect(page.getByText(`0/${assets.length}`).first()).toBeVisible();
	await page.getByLabel("Search assets").fill("");

	for (const asset of assets) {
		await page.getByLabel("Search assets").fill(asset.id);
		await page
			.getByRole("button", { name: new RegExp(EscapeRegExp(asset.name)) })
			.click();
		await expect(
			page
				.getByRole("heading", { name: new RegExp(EscapeRegExp(asset.id)) })
				.first(),
		).toBeVisible();
		await page.getByLabel("Search assets").fill("");

		const checkboxes = page.getByRole("checkbox");
		for (let index = 0; index < (await checkboxes.count()); index += 1) {
			await checkboxes.nth(index).click();
			await expect(checkboxes.nth(index)).toHaveAttribute(
				"aria-checked",
				"true",
			);
		}

		const timelineResponse = await request.get(
			`${ApiOrigin}/assets/${encodeURIComponent(asset.id)}/timeline`,
		);
		expect(timelineResponse.ok()).toBeTruthy();
		const timeline: TimelineEvent[] = await timelineResponse.json();
		const timelineTypes = [
			...new Set(timeline.map((event) => FormatDisplayLabel(event.event_type))),
		];
		await page.getByRole("button", { exact: true, name: "Timeline" }).click();
		for (const timelineType of timelineTypes) {
			const button = page.getByRole("button", {
				exact: true,
				name: timelineType,
			});
			if ((await button.count()) > 0) await button.click();
		}
		const allButton = page.getByRole("button", { exact: true, name: "All" });
		if ((await allButton.count()) > 0) await allButton.click();
		for (const tab of ["Gaps", "Trace", "Overview"]) {
			const tabButton = page.getByRole("button", { exact: true, name: tab });
			if ((await tabButton.count()) > 0) await tabButton.click();
		}
	}

	const exportPack = page.waitForEvent("download");
	await page.getByRole("button", { name: "Export Pack" }).click();
	expect((await exportPack).suggestedFilename()).toMatch(/\.md$/);
	const inspectorExport = page.waitForEvent("download");
	await page.getByRole("button", { exact: true, name: "Export" }).click();
	expect((await inspectorExport).suggestedFilename()).toMatch(/\.md$/);
}

async function ExerciseGraphControls(page: Page) {
	await OpenRoute(page, "/graph", "Evidence Graph");
	await expect(page.getByTestId("evidence-graph")).toBeVisible();
	const graphNodes = page.locator("[aria-label^='Graph node']");
	const graphEdges = page.locator("[aria-label^='Graph edge']");
	await expect(graphNodes.first()).toBeVisible({ timeout: 30_000 });
	expect(await graphNodes.count()).toBeGreaterThan(0);
	expect(await graphEdges.count()).toBeGreaterThan(0);
	for (
		let index = 0;
		index < Math.min(await graphNodes.count(), 10);
		index += 1
	) {
		await graphNodes.nth(index).click();
		await expect(page.getByText("No Node Selected")).toHaveCount(0);
	}
	const focusButton = page.getByRole("button", { name: "Focus Node" });
	if (await focusButton.isEnabled()) {
		await focusButton.click();
		await expect(page.getByRole("button", { name: "Focused" })).toBeVisible();
		await page.getByRole("button", { name: "Focused" }).click();
	}
	await page.getByRole("button", { exact: true, name: "Fit" }).click();
	for (const controlName of ["Zoom in", "Zoom out", "Fit view"]) {
		const control = page.getByRole("button", { name: controlName });
		if ((await control.count()) > 0) await control.click();
	}
	await graphEdges.first().click({ force: true });
	await expect(page.getByText(/Page \d+/).first()).toBeVisible();

	const typeCombobox = page.getByRole("combobox", { name: "Type" });
	await typeCombobox.click();
	const optionNames = await page
		.getByRole("option")
		.evaluateAll((options) =>
			options.map((option) => option.textContent?.trim() || "").filter(Boolean),
		);
	await page.keyboard.press("Escape");
	for (const optionName of optionNames) {
		await typeCombobox.click();
		await page.getByRole("option", { exact: true, name: optionName }).click();
	}
	await page.getByLabel("Search graph").fill("definitely-no-such-node");
	await expect(page.getByText("No Graph Nodes")).toBeVisible();
	await page.getByLabel("Search graph").fill("");
	await page.getByRole("button", { exact: true, name: "Reset" }).click();
	await expect(graphNodes.first()).toBeVisible();
	for (const exportName of ["JSON", "Cypher"]) {
		const download = page.waitForEvent("download");
		await page.getByRole("button", { exact: true, name: exportName }).click();
		expect((await download).suggestedFilename()).toMatch(
			exportName === "JSON" ? /\.json$/ : /\.cypher$/,
		);
	}
}

async function ExerciseComplianceControls(page: Page) {
	await OpenRoute(page, "/compliance", "Compliance Review");
	await page
		.getByLabel("Compliance Request")
		.fill(
			"Summarise high severity safety compliance gaps with cited evidence.",
		);
	let responsePromise = WaitForApiResponse(page, "/compliance/check", "POST");
	await page.getByRole("button", { name: "Run Check" }).first().click();
	let response = await responsePromise;
	expect(response.status()).toBe(200);
	let result = await response.json();
	expect(result.summary.length).toBeGreaterThan(20);
	await expect(page.getByText(result.summary)).toBeVisible();

	await page
		.getByLabel("Compliance Request")
		.fill("List the most urgent open compliance actions by asset.");
	responsePromise = WaitForApiResponse(page, "/compliance/check", "POST");
	await page.getByRole("button", { name: "Run Check" }).last().click();
	response = await responsePromise;
	expect(response.status()).toBe(200);
	result = await response.json();
	await expect(page.getByText(result.summary)).toBeVisible();

	await page.getByLabel("Search gaps").fill("no-matching-gap");
	await expect(page.getByText("No Matching Gaps")).toBeVisible();
	await page.getByLabel("Search gaps").fill("");
	const filterLabels: string[] = [
		...new Set(
			(result.gaps as Array<{ severity: string; status: string }>).flatMap(
				(gap) => [
					FormatDisplayLabel(gap.severity),
					FormatDisplayLabel(gap.status),
				],
			),
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
	const checkboxes = page.getByRole("checkbox");
	for (let index = 0; index < (await checkboxes.count()); index += 1) {
		await checkboxes.nth(index).click();
		await expect(checkboxes.nth(index)).toHaveAttribute("aria-checked", "true");
	}
	await ClickComplianceExport(page);
}

async function ClickComplianceExport(page: Page, pointer?: SmoothPointer) {
	const responsePromise = WaitForApiResponse(
		page,
		"/compliance/evidence-pack",
		"GET",
	);
	const exportButton = page
		.getByRole("button", { name: "Export Pack" })
		.first();
	if (pointer) {
		await pointer.moveTo(exportButton);
	}
	await exportButton.click();
	const response = await responsePromise;
	expect(response.status()).toBe(200);
	const pack = await response.json();
	expect(pack.filename).toMatch(/\.md$/);
	expect(pack.markdown.length).toBeGreaterThan(100);
	await expect(page.getByText("Evidence pack exported")).toBeVisible();
}

async function ExerciseRcaControls(page: Page, request: APIRequestContext) {
	const assets = await LoadAssets(request);
	await OpenRoute(page, "/rca", "Root Cause Analysis");
	const assetCombobox = page.getByRole("combobox", { name: "Asset" });
	for (const asset of assets) {
		await assetCombobox.click();
		const option = page.getByRole("option", {
			name: new RegExp(`^${EscapeRegExp(asset.id)}\\s*/`),
		});
		if ((await option.count()) > 0) await option.click();
	}
	const preferredAsset = PickPreferredAsset(assets);
	await SelectAssetOption(page, preferredAsset.id);
	await page
		.getByLabel("Symptom")
		.fill("Seal leakage increased after the latest maintenance intervention.");
	const responsePromise = WaitForApiResponse(page, "/rca", "POST");
	await page.getByRole("button", { name: "Generate RCA" }).click();
	const response = await responsePromise;
	expect(response.status()).toBe(200);
	const report = await response.json();
	expect(report.likely_causes.length).toBeGreaterThan(0);
	expect(report.recommended_checks.length).toBeGreaterThan(0);
	expect(report.preventive_actions.length).toBeGreaterThan(0);
	expect(report.supporting_evidence.length).toBeGreaterThan(0);
	await expect(
		page.getByRole("heading", { name: "Likely Causes" }),
	).toBeVisible();
	const checkboxes = page.getByRole("checkbox");
	for (let index = 0; index < (await checkboxes.count()); index += 1) {
		await checkboxes.nth(index).click();
		await expect(checkboxes.nth(index)).toHaveAttribute("aria-checked", "true");
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
}

async function ExerciseMobileNavigation(page: Page) {
	await page.setViewportSize({ height: 844, width: 390 });
	await OpenRoute(page, "/", "Command Centre");
	await page.getByRole("button", { name: "Open Navigation" }).click();
	await page.getByRole("button", { name: "Close Navigation" }).last().click();
	await page.getByRole("button", { name: "Open Navigation" }).click();
	await page.keyboard.press("Escape");
	await page.getByRole("button", { name: "Open Navigation" }).click();
	await page
		.getByRole("navigation", { name: "Main Navigation" })
		.getByRole("link", { exact: true, name: "Evidence" })
		.click();
	await expect(
		page.getByRole("heading", { name: "Evidence Workspace" }).first(),
	).toBeVisible();
	await page.setViewportSize({ height: 900, width: 1440 });
}

async function LoadAssets(request: APIRequestContext): Promise<Asset[]> {
	const response = await request.get(`${ApiOrigin}/assets`);
	expect(response.ok()).toBeTruthy();
	const assets = (await response.json()) as Asset[];
	expect(assets.length).toBeGreaterThan(0);
	return assets;
}

function PickPreferredAsset(assets: Asset[]) {
	return (
		assets.find((asset) => asset.id.includes("P-101")) ??
		assets.find((asset) => asset.name.toLowerCase().includes("pump")) ??
		assets[0]
	);
}

async function SelectAssetOption(page: Page, assetId: string) {
	const assetCombobox = page.getByRole("combobox", { name: "Asset" });
	await assetCombobox.click();
	const option = page.getByRole("option", {
		name: new RegExp(`^${EscapeRegExp(assetId)}\\s*/`),
	});
	if ((await option.count()) > 0) {
		await option.click();
		return;
	}
	await page.getByRole("option").first().click();
}

function EscapeRegExp(value: string) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
