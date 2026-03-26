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
		if (lower === "authorization" || lower === "host") continue;
		headers.set(key, value);
	}

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
	} catch {
		return Response.json(
			{ error: "upstream request failed" },
			{ status: 502 },
		);
	}

	const responseHeaders = new Headers();
	for (const [key, value] of upstreamResponse.headers.entries()) {
		const lower = key.toLowerCase();
		if (lower === "transfer-encoding") continue;
		responseHeaders.set(key, value);
	}

	return new Response(upstreamResponse.body, {
		status: upstreamResponse.status,
		headers: responseHeaders,
	});
}
