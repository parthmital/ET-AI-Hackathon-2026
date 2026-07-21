import {
	expect,
	type Locator,
	type Page,
	type Response,
} from "@playwright/test";

type Point = {
	x: number;
	y: number;
};

type MoveOptions = {
	offset?: Point;
	steps?: number;
};

export class SmoothPointer {
	private position: Point = { x: 720, y: 450 };

	constructor(private readonly page: Page) {}

	async moveTo(target: Locator, options: MoveOptions = {}) {
		await target.waitFor({ state: "visible" });
		await SmoothScrollIntoView(this.page, target);
		const box = await target.boundingBox();
		if (!box) throw new Error("Cannot move to an element without a box.");

		const offset = options.offset ?? { x: box.width / 2, y: box.height / 2 };
		const next = {
			x: box.x + offset.x,
			y: box.y + offset.y,
		};
		const distance = Math.hypot(
			next.x - this.position.x,
			next.y - this.position.y,
		);
		const steps =
			options.steps ?? Math.max(12, Math.min(42, Math.ceil(distance / 32)));

		for (let index = 1; index <= steps; index += 1) {
			const progress = EaseInOutCubic(index / steps);
			await this.page.mouse.move(
				this.position.x + (next.x - this.position.x) * progress,
				this.position.y + (next.y - this.position.y) * progress,
			);
			await this.page.waitForTimeout(4);
		}
		this.position = next;
	}

	async click(target: Locator, options: MoveOptions = {}) {
		await this.moveTo(target, options);
		await target.click(
			options.offset ? { position: options.offset } : undefined,
		);
		await Pause(this.page, 260);
	}
}

export async function OpenRoute(
	page: Page,
	path: string,
	heading: string | RegExp,
) {
	await page.goto(path, { waitUntil: "domcontentloaded" });
	await expect(
		page.getByRole("heading", { name: heading }).first(),
	).toBeVisible();
	await WaitForSkeletonsToSettle(page);
}

export async function NavigateByRail(
	page: Page,
	pointer: SmoothPointer,
	label: string,
	heading: string | RegExp,
) {
	await pointer.click(
		page
			.getByRole("navigation", { name: "Main Navigation" })
			.getByRole("link", { exact: true, name: label }),
	);
	await expect(
		page.getByRole("heading", { name: heading }).first(),
	).toBeVisible();
	await WaitForSkeletonsToSettle(page);
}

export async function SmoothScrollIntoView(
	page: Page,
	target: Locator,
	position = 0.38,
) {
	const handle = await target.elementHandle();
	if (!handle) return;
	await page.evaluate(
		async ({ element, viewportPosition }) => {
			const rect = element.getBoundingClientRect();
			const start = window.scrollY;
			const targetY = Math.max(
				0,
				start + rect.top - window.innerHeight * viewportPosition,
			);
			await new Promise<void>((resolve) => {
				const startedAt = performance.now();
				const duration = 420;
				function frame(now: number) {
					const progress = Math.min((now - startedAt) / duration, 1);
					const eased =
						progress < 0.5
							? 4 * progress * progress * progress
							: 1 - Math.pow(-2 * progress + 2, 3) / 2;
					window.scrollTo(0, start + (targetY - start) * eased);
					if (progress < 1) {
						window.requestAnimationFrame(frame);
						return;
					}
					resolve();
				}
				window.requestAnimationFrame(frame);
			});
		},
		{ element: handle, viewportPosition: position },
	);
	await handle.dispose();
	await page.waitForTimeout(120);
}

export async function SmoothScrollBy(page: Page, deltaY: number) {
	await page.evaluate(
		async ({ delta }) => {
			const start = window.scrollY;
			const maxScroll =
				document.documentElement.scrollHeight - window.innerHeight;
			const targetY = Math.max(0, Math.min(maxScroll, start + delta));
			await new Promise<void>((resolve) => {
				const startedAt = performance.now();
				const duration = 520;
				function frame(now: number) {
					const progress = Math.min((now - startedAt) / duration, 1);
					const eased = 1 - Math.pow(1 - progress, 3);
					window.scrollTo(0, start + (targetY - start) * eased);
					if (progress < 1) {
						window.requestAnimationFrame(frame);
						return;
					}
					resolve();
				}
				window.requestAnimationFrame(frame);
			});
		},
		{ delta: deltaY },
	);
	await page.waitForTimeout(120);
}

export async function Pause(page: Page, milliseconds = 650) {
	await page.waitForTimeout(milliseconds);
}

export function WaitForApiResponse(
	page: Page,
	path: string | RegExp,
	method = "GET",
	timeout = 600_000,
) {
	return page.waitForResponse(
		(response) =>
			response.request().method() === method &&
			MatchesApiPath(response, path) &&
			response.status() < 500,
		{ timeout },
	);
}

export async function WaitForSkeletonsToSettle(page: Page) {
	await page.waitForTimeout(120);
	await expect
		.poll(async () => await page.locator(".animate-pulse").count(), {
			intervals: [100, 200, 300],
			timeout: 10_000,
		})
		.toBe(0);
}

export async function ExpectNoHorizontalOverflow(page: Page) {
	const overflow = await page.evaluate(
		() =>
			document.documentElement.scrollWidth -
			document.documentElement.clientWidth,
	);
	expect(overflow).toBeLessThanOrEqual(1);
}

export function CollectBrowserDiagnostics(page: Page) {
	const diagnostics: string[] = [];
	page.on("console", (message) => {
		if (message.type() === "error")
			diagnostics.push(`console: ${message.text()}`);
	});
	page.on("pageerror", (error) =>
		diagnostics.push(`pageerror: ${error.message}`),
	);
	page.on("requestfailed", (request) => {
		const failure = request.failure()?.errorText ?? "unknown failure";
		if (failure.includes("ERR_ABORTED")) return;
		diagnostics.push(
			`requestfailed: ${request.method()} ${request.url()} ${failure}`,
		);
	});
	page.on("response", (response) => {
		if (response.status() < 400) return;
		const url = response.url();
		if (!url.includes("127.0.0.1:8000") && !url.includes("/api/backend")) {
			return;
		}
		diagnostics.push(
			`response: ${response.status()} ${response.request().method()} ${url}`,
		);
	});
	return diagnostics;
}

function MatchesApiPath(response: Response, path: string | RegExp) {
	const pathname = NormaliseApiPath(response.url());
	return typeof path === "string" ? pathname === path : path.test(pathname);
}

function NormaliseApiPath(rawUrl: string) {
	const url = new URL(rawUrl);
	if (url.pathname.startsWith("/api/backend")) {
		return url.pathname.replace(/^\/api\/backend/, "") || "/";
	}
	return url.pathname;
}

function EaseInOutCubic(value: number) {
	return value < 0.5
		? 4 * value * value * value
		: 1 - Math.pow(-2 * value + 2, 3) / 2;
}
