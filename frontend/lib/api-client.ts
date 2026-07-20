import {
	IsTerminalTraceEnabled,
	LogToTerminal,
	SummariseForTerminal,
	ToJsonValue,
} from "@/lib/terminalLogging";

const DEFAULT_API_BASE_URL = "http://127.0.0.1:8000";
const CONFIGURED_API_BASE_URL =
	process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL;
const API_BASE_URL = ResolveBrowserApiBaseUrl(CONFIGURED_API_BASE_URL);
const HEALTH_API_BASE_URL = "/api/backend";

type ApiFailure = {
	diagnostic: unknown;
	message: string;
	rawMessage: string;
};

export class ApiError extends Error {
	diagnostic: unknown;
	path: string;
	rawMessage: string;
	status: number;

	constructor({
		diagnostic,
		message,
		path,
		rawMessage,
		status,
	}: ApiFailure & { path: string; status: number }) {
		super(message);
		this.name = "ApiError";
		this.diagnostic = diagnostic;
		this.path = path;
		this.rawMessage = rawMessage;
		this.status = status;
	}
}

export async function ApiFetch<T>(
	path: string,
	init?: RequestInit,
): Promise<T> {
	const headers = await BuildRequestHeaders(init);
	const method = init?.method ?? "GET";
	const url = `${ResolveRequestApiBaseUrl(path)}${path}`;
	const startedAt = performance.now();
	const traceLogging = IsTerminalTraceEnabled();
	LogToTerminal("trace", "api.request.start", {
		body: DescribeBody(init?.body),
		headers: Object.fromEntries(headers.entries()),
		method,
		path,
		url,
	});
	let response: Response;
	try {
		response = await fetch(url, {
			...init,
			headers,
			cache: "no-store",
		});
	} catch (error) {
		LogToTerminal("error", "api.request.network_error", {
			elapsedMilliseconds: Math.round(performance.now() - startedAt),
			error,
			method,
			path,
			url,
		});
		console.error("[api] Network request failed", {
			error,
			method,
			path,
		});
		throw new Error("Backend request failed. Check the console for details.", {
			cause: error,
		});
	}
	const responseBody = traceLogging
		? await ReadResponseTextForLog(response)
		: "";
	LogToTerminal(response.ok ? "trace" : "error", "api.response.finish", {
		body: responseBody || undefined,
		bodyBytes: Number(response.headers.get("content-length")) || null,
		elapsedMilliseconds: Math.round(performance.now() - startedAt),
		headers: Object.fromEntries(response.headers.entries()),
		method,
		path,
		status: response.status,
		statusText: response.statusText,
		url,
	});
	if (!response.ok) {
		const failure = await ReadApiError(response);
		const error = new ApiError({
			...failure,
			path,
			status: response.status,
		});
		console.error("[api] Request failed", {
			diagnostic: traceLogging
				? failure.diagnostic
				: SummariseForTerminal(failure.diagnostic),
			message: failure.message,
			method,
			path,
			rawMessage: failure.rawMessage,
			status: response.status,
			statusText: response.statusText,
		});
		throw error;
	}
	return response.json() as Promise<T>;
}

function DescribeBody(body: BodyInit | null | undefined): unknown {
	if (!body) return null;
	return ToJsonValue(body);
}

async function ReadResponseTextForLog(response: Response): Promise<string> {
	try {
		return await response.clone().text();
	} catch (error) {
		LogToTerminal("error", "api.response.read_error", {
			error,
			status: response.status,
			statusText: response.statusText,
		});
		return "";
	}
}

async function ReadApiError(response: Response): Promise<ApiFailure> {
	const fallback = `API request failed with ${response.status}`;
	let diagnostic: unknown;
	let rawMessage = fallback;
	try {
		const payload = (await response.clone().json()) as unknown;
		diagnostic = payload;
		if (payload && typeof payload === "object" && "detail" in payload) {
			const detail = (payload as { detail: unknown }).detail;
			if (typeof detail === "string" && detail.trim()) {
				rawMessage = detail;
			}
			if (Array.isArray(detail)) {
				rawMessage =
					detail
						.map((item) => {
							if (
								item &&
								typeof item === "object" &&
								"msg" in item &&
								typeof (item as { msg: unknown }).msg === "string"
							) {
								return (item as { msg: string }).msg;
							}
							return "";
						})
						.filter(Boolean)
						.join(", ") || fallback;
			}
		}
	} catch {
		const text = await response.text().catch(() => "");
		diagnostic = text;
		rawMessage = text || fallback;
	}
	return {
		diagnostic,
		message: FormatVisibleError(rawMessage, fallback),
		rawMessage,
	};
}

export function FormatVisibleError(
	message: string,
	fallback = "Request failed. Check the console for details.",
) {
	const trimmed = message.trim();
	if (!trimmed) return fallback;
	const lower = trimmed.toLowerCase();
	if (
		lower.includes("rate_limit") ||
		lower.includes("rate limit") ||
		lower.includes("http 429") ||
		lower.includes("tokens per minute") ||
		lower.includes("tpm")
	) {
		return "LLM provider rate limit reached. Retry after a few seconds.";
	}
	if (lower.includes("temporarily unavailable")) {
		return "LLM provider is temporarily unavailable. Try again shortly.";
	}
	if (lower.includes("timed out") || lower.includes("timeout")) {
		return "LLM provider timed out. Try again.";
	}
	if (lower.includes("connection failed") || lower.includes("network")) {
		return "DeepSeek connection failed. Check the console for details.";
	}
	if (lower.includes("invalid structured output")) {
		return "LLM returned invalid structured output. Try again.";
	}
	if (lower.includes("api_key") || lower.includes("api key")) {
		return trimmed;
	}
	if (lower.includes("insufficient balance") || lower.includes("http 402")) {
		return "DeepSeek account has insufficient balance. Add credit before retrying.";
	}
	if (trimmed.length > 220 || trimmed.includes('{"error"')) {
		return fallback;
	}
	return trimmed;
}

function ResolveBrowserApiBaseUrl(baseUrl: string) {
	if (typeof window === "undefined") {
		return IsLocalApiBaseUrl(baseUrl) ? baseUrl : DEFAULT_API_BASE_URL;
	}
	if (!baseUrl.trim()) return "/api/backend";
	if (baseUrl.startsWith("/")) return baseUrl;
	try {
		return IsLocalApiBaseUrl(baseUrl) ? baseUrl : DEFAULT_API_BASE_URL;
	} catch {
		return DEFAULT_API_BASE_URL;
	}
}

function IsLocalApiBaseUrl(baseUrl: string) {
	try {
		const parsed = new URL(baseUrl);
		return (
			["http:", "https:"].includes(parsed.protocol) &&
			["localhost", "127.0.0.1", "0.0.0.0", "[::1]"].includes(parsed.hostname)
		);
	} catch {
		return false;
	}
}

function ResolveRequestApiBaseUrl(path: string) {
	if (typeof window !== "undefined" && path === "/health") {
		return HEALTH_API_BASE_URL;
	}
	return API_BASE_URL;
}

async function BuildRequestHeaders(init?: RequestInit) {
	const headers = new Headers(init?.headers);
	if (!(init?.body instanceof FormData) && !headers.has("Content-Type")) {
		headers.set("Content-Type", "application/json");
	}
	return headers;
}
