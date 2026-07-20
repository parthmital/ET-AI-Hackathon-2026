import { NextRequest } from "next/server";

export const runtime = "nodejs";
const LocalBackendApiBaseUrl = "http://127.0.0.1:8000";

type ProxyRouteContext = {
	params: Promise<{ path?: string[] }>;
};

const HOP_BY_HOP_HEADERS = new Set([
	"connection",
	"content-encoding",
	"content-length",
	"keep-alive",
	"te",
	"trailer",
	"transfer-encoding",
	"upgrade",
]);
const FORWARDED_REQUEST_HEADERS = new Set(["accept", "content-type"]);

export async function GET(request: NextRequest, context: ProxyRouteContext) {
	return ProxyBackendRequest(request, context);
}

export async function POST(request: NextRequest, context: ProxyRouteContext) {
	return ProxyBackendRequest(request, context);
}

export async function PUT(request: NextRequest, context: ProxyRouteContext) {
	return ProxyBackendRequest(request, context);
}

export async function PATCH(request: NextRequest, context: ProxyRouteContext) {
	return ProxyBackendRequest(request, context);
}

export async function DELETE(request: NextRequest, context: ProxyRouteContext) {
	return ProxyBackendRequest(request, context);
}

export async function OPTIONS(
	request: NextRequest,
	context: ProxyRouteContext,
) {
	return ProxyBackendRequest(request, context);
}

async function ProxyBackendRequest(
	request: NextRequest,
	context: ProxyRouteContext,
) {
	const params = await context.params;
	const proxyPath = params.path ?? [];
	const targetUrl = BuildBackendUrl(request, proxyPath);
	if (!targetUrl) {
		return Response.json(
			{ detail: "Backend API base URL is not configured." },
			{ status: 500 },
		);
	}

	let upstreamResponse: Response;
	try {
		upstreamResponse = await fetch(targetUrl, {
			body: ShouldForwardBody(request.method)
				? await request.arrayBuffer()
				: undefined,
			headers: ForwardRequestHeaders(request.headers),
			method: request.method,
			cache: "no-store",
		});
	} catch {
		return Response.json(
			{ detail: "Backend request failed. Check the local backend service." },
			{ status: 502 },
		);
	}

	return new Response(upstreamResponse.body, {
		headers: ForwardResponseHeaders(upstreamResponse.headers),
		status: upstreamResponse.status,
		statusText: upstreamResponse.statusText,
	});
}

function BuildBackendUrl(request: NextRequest, proxyPath: string[]) {
	const baseUrl = ResolveBackendApiBaseUrl();
	if (baseUrl.startsWith("/")) return null;

	let targetUrl: URL;
	try {
		targetUrl = new URL(baseUrl);
	} catch {
		return null;
	}
	const basePath = targetUrl.pathname.replace(/\/$/, "");
	targetUrl.pathname = [basePath, ...proxyPath.map(encodeURIComponent)]
		.filter(Boolean)
		.join("/");
	targetUrl.search = new URL(request.url).search;
	return targetUrl;
}

function ResolveBackendApiBaseUrl() {
	const backendBaseUrl = process.env.BACKEND_API_BASE_URL?.trim();
	if (backendBaseUrl && IsLocalBackendApiBaseUrl(backendBaseUrl)) {
		return backendBaseUrl;
	}

	const publicBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
	if (
		publicBaseUrl &&
		!publicBaseUrl.startsWith("/") &&
		IsLocalBackendApiBaseUrl(publicBaseUrl)
	) {
		return publicBaseUrl;
	}

	return LocalBackendApiBaseUrl;
}

function IsLocalBackendApiBaseUrl(baseUrl: string) {
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

function ShouldForwardBody(method: string) {
	return method !== "GET" && method !== "HEAD";
}

function ForwardRequestHeaders(headers: Headers) {
	const forwardedHeaders = new Headers();
	for (const [header, value] of headers.entries()) {
		if (FORWARDED_REQUEST_HEADERS.has(header.toLowerCase())) {
			forwardedHeaders.set(header, value);
		}
	}
	return forwardedHeaders;
}

function ForwardResponseHeaders(headers: Headers) {
	const forwardedHeaders = new Headers(headers);
	for (const header of HOP_BY_HOP_HEADERS) {
		forwardedHeaders.delete(header);
	}
	return forwardedHeaders;
}
