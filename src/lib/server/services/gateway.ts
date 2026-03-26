import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { targets } from "../db/schema";
import type { Token } from "../db/schema";
import { getDefaultAuthMethod } from "./auth-methods";
import { hasPermission } from "./permissions";

/**
 * Proxy a request through the gateway to an upstream target.
 * @param token - Authenticated token making the request
 * @param targetSlug - Target slug to proxy to
 * @param subPath - Remaining path after /gateway/{slug}/, e.g. "v1/chat/completions" (no leading slash expected but handled)
 * @param request - Original incoming request
 */
export async function proxyRequest(
	token: Token,
	targetSlug: string,
	subPath: string,
	request: Request,
): Promise<Response> {
	const [target] = await db
		.select()
		.from(targets)
		.where(and(eq(targets.slug, targetSlug), eq(targets.enabled, true)))
		.limit(1);

	if (!target) {
		return Response.json({ error: "target not found" }, { status: 404 });
	}

	const permitted = await hasPermission(token.id, target.id);
	if (!permitted) {
		return Response.json({ error: "forbidden" }, { status: 403 });
	}

	if (target.type !== "api") {
		return Response.json(
			{ error: "only api targets support HTTP proxy" },
			{ status: 400 },
		);
	}

	if (!target.baseUrl) {
		return Response.json(
			{ error: "target has no base_url configured" },
			{ status: 400 },
		);
	}

	// Block path traversal
	const decoded = decodeURIComponent(subPath);
	if (decoded.includes("..")) {
		return Response.json({ error: "invalid path" }, { status: 400 });
	}

	const url = new URL(subPath || "/", target.baseUrl);
	url.search = new URL(request.url).search;

	// Build upstream headers, stripping our auth
	const headers = new Headers();
	for (const [key, value] of request.headers.entries()) {
		const lower = key.toLowerCase();
		// Strip our own auth and hop-by-hop/proxy headers before forwarding upstream.
		// Forwarding x-forwarded-* and x-real-ip leaks that the request is proxied,
		// which some APIs (e.g. Semrush) use to block or rate-limit requests.
		if (
			lower === "authorization" ||
			lower === "host" ||
			lower === "x-forwarded-for" ||
			lower === "x-forwarded-host" ||
			lower === "x-forwarded-port" ||
			lower === "x-forwarded-proto" ||
			lower === "x-forwarded-server" ||
			lower === "x-real-ip"
		) continue;
		headers.set(key, value);
	}
	// Normalize Accept-Encoding to exclude Brotli — Node's fetch cannot decompress
	// Brotli responses, which causes HTTP/2 stream errors with Cloudflare-proxied APIs.
	headers.set("Accept-Encoding", "gzip, deflate");

	// Inject default auth method credentials
	const authMethod = await getDefaultAuthMethod(target.id);
	if (authMethod) {
		if (authMethod.type === "bearer") {
			headers.set("Authorization", `Bearer ${authMethod.credential}`);
		} else if (authMethod.type === "basic") {
			const encoded = Buffer.from(authMethod.credential).toString("base64");
			headers.set("Authorization", `Basic ${encoded}`);
		} else if (authMethod.type === "custom_header") {
			const separatorIndex = authMethod.credential.indexOf(":");
			if (separatorIndex > 0) {
				const headerName = authMethod.credential.slice(0, separatorIndex).trim();
				const headerValue = authMethod.credential.slice(separatorIndex + 1).trim();
				headers.set(headerName, headerValue);
			}
		} else if (authMethod.type === "query_param") {
			const separatorIndex = authMethod.credential.indexOf(":");
			if (separatorIndex > 0) {
				const paramName = authMethod.credential.slice(0, separatorIndex).trim();
				const paramValue = authMethod.credential.slice(separatorIndex + 1).trim();
				url.searchParams.set(paramName, paramValue);
			}
		}
	}

	// [DEBUG] Log outgoing upstream request
	console.log("[gateway] →", request.method, url.toString());
	console.log("[gateway] → headers:", Object.fromEntries(headers.entries()));

	let upstreamResponse: Response;
	try {
		upstreamResponse = await fetch(url.toString(), {
			method: request.method,
			headers,
			body:
				request.method !== "GET" && request.method !== "HEAD"
					? request.body
					: undefined,
			// @ts-expect-error duplex needed for streaming body
			duplex: "half",
		});
	} catch (err) {
		console.error("[gateway] ✗ upstream request failed:", err);
		return Response.json(
			{ error: "upstream request failed" },
			{ status: 502 },
		);
	}

	// [DEBUG] Log upstream response
	console.log("[gateway] ←", upstreamResponse.status, url.toString());
	console.log("[gateway] ← headers:", Object.fromEntries(upstreamResponse.headers.entries()));

	const responseHeaders = new Headers();
	for (const [key, value] of upstreamResponse.headers.entries()) {
		const lower = key.toLowerCase();
		// Strip hop-by-hop headers — body is fully buffered and decoded below
		if (lower === "transfer-encoding" || lower === "content-encoding") continue;
		responseHeaders.set(key, value);
	}

	// Buffer the full body so Node decodes chunked/compressed encoding before forwarding.
	// Streaming the raw body passes undecoded chunked frames to HTTP/1.1 clients.
	const body = await upstreamResponse.arrayBuffer();
	responseHeaders.set("Content-Length", String(body.byteLength));

	return new Response(body, {
		status: upstreamResponse.status,
		headers: responseHeaders,
	});
}
