export type TerminalLogLevel = "trace" | "debug" | "info" | "warn" | "error";

type JsonValue =
	boolean | null | number | string | JsonValue[] | { [key: string]: JsonValue };

type TerminalLogPayload = {
	at: string;
	event: string;
	fields: JsonValue;
	level: TerminalLogLevel;
	runtime: "browser" | "server";
};

let installed = false;
const TerminalLevelRank: Record<TerminalLogLevel, number> = {
	trace: 10,
	debug: 20,
	info: 30,
	warn: 40,
	error: 50,
};

export function InstallFrontendTerminalLogging() {
	if (installed || typeof window === "undefined") return;
	installed = true;
	LogToTerminal("trace", "frontend.logging.install", {
		location: window.location.href,
		userAgent: window.navigator.userAgent,
	});
	window.addEventListener("error", (event) => {
		LogToTerminal("error", "frontend.unhandled_error", {
			colno: event.colno,
			error: event.error,
			filename: event.filename,
			lineno: event.lineno,
			message: event.message,
		});
	});
	window.addEventListener("unhandledrejection", (event) => {
		LogToTerminal("error", "frontend.unhandled_rejection", {
			reason: event.reason,
		});
	});
	window.addEventListener("beforeunload", () => {
		LogToTerminal("trace", "frontend.lifecycle.beforeunload", {
			location: window.location.href,
		});
	});
}

export function LogToTerminal(
	level: TerminalLogLevel,
	event: string,
	fields: Record<string, unknown> = {},
) {
	if (!ShouldLogTerminalLevel(level)) return;
	const payload: TerminalLogPayload = {
		at: new Date().toISOString(),
		event,
		fields: ToJsonValue(
			IsTerminalTraceEnabled() ? fields : SummariseForTerminal(fields),
		),
		level,
		runtime: typeof window === "undefined" ? "server" : "browser",
	};
	LogToConsole(payload);
	EmitToTerminal(payload);
}

export function ToJsonValue(value: unknown): JsonValue {
	return ToJsonValueInternal(value, new WeakSet<object>());
}

export function IsTerminalTraceEnabled() {
	return process.env.NEXT_PUBLIC_TERMINAL_LOG_LEVEL === "trace";
}

export function SummariseForTerminal(value: unknown): unknown {
	if (value === null || value === undefined) return value ?? null;
	if (typeof value === "string") {
		if (value.length <= 96) return value;
		return { chars: value.length, type: "string" };
	}
	if (typeof value === "number" || typeof value === "boolean") return value;
	if (value instanceof Error) {
		return {
			message: value.message,
			name: value.name,
			stack: value.stack ? { chars: value.stack.length, type: "string" } : "",
		};
	}
	if (typeof File !== "undefined" && value instanceof File) {
		return {
			lastModified: value.lastModified,
			name: value.name,
			size: value.size,
			type: value.type,
		};
	}
	if (typeof Blob !== "undefined" && value instanceof Blob) {
		return { size: value.size, type: value.type };
	}
	if (typeof FormData !== "undefined" && value instanceof FormData) {
		return { entries: Array.from(value.keys()).length, type: "FormData" };
	}
	if (Array.isArray(value)) {
		return {
			count: value.length,
			sample: value.slice(0, 3).map((item) => SummariseForTerminal(item)),
			type: "array",
		};
	}
	if (typeof value === "object") {
		const result: Record<string, unknown> = {};
		for (const [key, item] of Object.entries(value)) {
			if (IsSensitiveKey(key)) {
				result[key] = "[redacted]";
				continue;
			}
			if (ShouldKeepSummaryField(key, item)) {
				result[key] = SummariseForTerminal(item);
				continue;
			}
			if (Array.isArray(item)) {
				result[`${key}Count`] = item.length;
				continue;
			}
			if (typeof item === "string") {
				result[`${key}Chars`] = item.length;
				continue;
			}
			if (item && typeof item === "object") {
				result[`${key}Keys`] = Object.keys(item).length;
			}
		}
		return result;
	}
	return String(value);
}

function ToJsonValueInternal(value: unknown, seen: WeakSet<object>): JsonValue {
	if (value === null) return null;
	if (typeof value === "string") return value;
	if (typeof value === "number")
		return Number.isFinite(value) ? value : String(value);
	if (typeof value === "boolean") return value;
	if (typeof value === "bigint") return value.toString();
	if (typeof value === "symbol") return value.toString();
	if (typeof value === "function") {
		return {
			name: value.name,
			type: "function",
		};
	}
	if (value instanceof Error) {
		if (seen.has(value)) return "[Circular]";
		seen.add(value);
		return {
			cause: ToJsonValueInternal(value.cause, seen),
			message: value.message,
			name: value.name,
			stack: value.stack ?? "",
		};
	}
	if (typeof File !== "undefined" && value instanceof File) {
		return {
			lastModified: value.lastModified,
			name: value.name,
			size: value.size,
			type: value.type,
		};
	}
	if (typeof Blob !== "undefined" && value instanceof Blob) {
		return {
			size: value.size,
			type: value.type,
		};
	}
	if (typeof FormData !== "undefined" && value instanceof FormData) {
		const entries: JsonValue[] = [];
		for (const [key, item] of value.entries()) {
			entries.push({
				key,
				value: ToJsonValueInternal(item, seen),
			});
		}
		return entries;
	}
	if (Array.isArray(value)) {
		if (seen.has(value)) return "[Circular]";
		seen.add(value);
		return value.map((item) => ToJsonValueInternal(item, seen));
	}
	if (typeof value === "object") {
		if (seen.has(value)) return "[Circular]";
		seen.add(value);
		const result: Record<string, JsonValue> = {};
		for (const [key, item] of Object.entries(value)) {
			result[key] = ToJsonValueInternal(item, seen);
		}
		return result;
	}
	return String(value);
}

function EmitToTerminal(payload: TerminalLogPayload) {
	if (
		typeof window === "undefined" ||
		process.env.NEXT_PUBLIC_TERMINAL_BROWSER_LOGS === "0"
	) {
		return;
	}
	const body = JSON.stringify(payload);
	try {
		void fetch("/api/client-logs", {
			body,
			headers: { "Content-Type": "application/json" },
			method: "POST",
		}).catch(() => undefined);
	} catch (error) {
		console.error("[terminal-log] emit failed", error);
	}
}

function LogToConsole(payload: TerminalLogPayload) {
	const method =
		payload.level === "error"
			? console.error
			: payload.level === "warn"
				? console.warn
				: payload.level === "info"
					? console.info
					: console.debug;
	method.call(console, `[${payload.runtime}:${payload.event}]`, payload);
}

function ShouldLogTerminalLevel(level: TerminalLogLevel) {
	if (IsTerminalTraceEnabled()) return true;
	return TerminalLevelRank[level] >= TerminalLevelRank.warn;
}

function ShouldKeepSummaryField(key: string, value: unknown) {
	const normalised = key.toLowerCase();
	if (
		[
			"assetid",
			"elapsedmilliseconds",
			"event",
			"filename",
			"level",
			"message",
			"method",
			"name",
			"path",
			"runtime",
			"status",
			"statustext",
			"type",
		].includes(normalised)
	) {
		return true;
	}
	return (
		typeof value === "number" || typeof value === "boolean" || value === null
	);
}

function IsSensitiveKey(key: string) {
	const normalised = key.toLowerCase().replaceAll("_", "-");
	return (
		[
			"api-key",
			"authorization",
			"cookie",
			"password",
			"proxy-authorization",
			"secret",
			"set-cookie",
			"token",
		].includes(normalised) || normalised.endsWith("-api-key")
	);
}
