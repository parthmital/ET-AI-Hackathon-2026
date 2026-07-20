import { NextRequest } from "next/server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
	const receivedAt = new Date().toISOString();
	const rawBody = await request.text();
	const payload = ParsePayload(rawBody);
	const fields = IsRecord(payload?.fields) ? payload.fields : {};
	const level = String(payload?.level ?? "info");
	const message = [
		"[client-log]",
		`level=${level}`,
		`event=${String(payload?.event ?? "unknown")}`,
		`runtime=${String(payload?.runtime ?? "unknown")}`,
		`method=${String(fields.method ?? request.method)}`,
		`path=${String(fields.path ?? new URL(request.url).pathname)}`,
		`status=${String(fields.status ?? "")}`,
		`elapsed_ms=${String(fields.elapsedMilliseconds ?? "")}`,
		`body_chars=${BodyChars(fields)}`,
		`header_count=${HeaderCount(fields)}`,
		`received_at=${receivedAt}`,
	]
		.filter((part) => !part.endsWith("="))
		.join(" ");
	Log(level, message);
	if (process.env.NEXT_PUBLIC_TERMINAL_LOG_LEVEL === "trace") {
		console.debug(`[client-log:payload] ${rawBody}`);
	}
	return new Response(null, { status: 204 });
}

function ParsePayload(body: string): Record<string, unknown> | null {
	try {
		const value = JSON.parse(body) as unknown;
		return IsRecord(value) ? value : null;
	} catch {
		return null;
	}
}

function IsRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function BodyChars(fields: Record<string, unknown>) {
	if (typeof fields.bodyChars === "number") return fields.bodyChars;
	if (typeof fields.bodyBytes === "number") return fields.bodyBytes;
	if (typeof fields.body === "string") return fields.body.length;
	if (IsRecord(fields.body) && typeof fields.body.chars === "number") {
		return fields.body.chars;
	}
	return 0;
}

function HeaderCount(fields: Record<string, unknown>) {
	if (IsRecord(fields.headers)) return Object.keys(fields.headers).length;
	if (typeof fields.headersKeys === "number") return fields.headersKeys;
	return 0;
}

function Log(level: string, message: string) {
	if (level === "error") {
		console.error(message);
		return;
	}
	if (level === "warn") {
		console.warn(message);
		return;
	}
	if (level === "debug" || level === "trace") {
		console.debug(message);
		return;
	}
	console.info(message);
}
