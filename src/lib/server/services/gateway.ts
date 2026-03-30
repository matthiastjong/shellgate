import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { targets } from "../db/schema";
import type { Target, Token } from "../db/schema";
import { getDefaultAuthMethod } from "./auth-methods";
import { hasPermission } from "./permissions";
import { signES256JWT } from "../utils/jwt";
import { getServiceAccountToken } from "../utils/oauth2";

/**
 * Resolve and validate a target for gateway proxying.
 * Returns the target if valid, or a Response error.
 */
export async function resolveGatewayTarget(
	token: Token,
	targetSlug: string,
): Promise<{ target: Target } | { error: Response }> {
	const [target] = await db
		.select()
		.from(targets)
		.where(and(eq(targets.slug, targetSlug), eq(targets.enabled, true)))
		.limit(1);

	if (!target) {
		return { error: Response.json({ error: "target not found" }, { status: 404 }) };
	}

	const permitted = await hasPermission(token.id, target.id);
	if (!permitted) {
		return { error: Response.json({ error: "forbidden" }, { status: 403 }) };
	}

	if (target.type !== "api") {
		return {
			error: Response.json(
				{ error: "only api targets support HTTP proxy" },
				{ status: 400 },
			),
		};
	}

	if (!target.baseUrl) {
		return {
			error: Response.json(
				{ error: "target has no base_url configured" },
				{ status: 400 },
			),
		};
	}

	return { target };
}

/**
 * Proxy a request through the gateway to an upstream target.
 * @param token - Authenticated token making the request
 * @param target - Resolved target to proxy to
 * @param subPath - Remaining path after /gateway/{slug}/
 * @param request - Original incoming request
 */
export async function proxyToTarget(
	target: Target,
	subPath: string,
	request: Request,
): Promise<Response> {
	// Block path traversal
	const decoded = decodeURIComponent(subPath);
	if (decoded.includes("..")) {
		return Response.json({ error: "invalid path" }, { status: 400 });
	}

	const url = new URL(subPath || "/", target.baseUrl!);
	url.search = new URL(request.url).search;

	// Build upstream headers, stripping our auth and proxy headers
	const headers = new Headers();
	for (const [key, value] of request.headers.entries()) {
		const lower = key.toLowerCase();
		if (
			lower === "authorization" ||
			lower === "host" ||
			lower === "x-forwarded-for" ||
			lower === "x-forwarded-host" ||
			lower === "x-forwarded-port" ||
			lower === "x-forwarded-proto" ||
			lower === "x-forwarded-server" ||
			lower === "x-real-ip" ||
			lower === "x-shellgate-approved"
		) continue;
		headers.set(key, value);
	}
	// Normalize Accept-Encoding to exclude Brotli
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
		} else if (authMethod.type === "jwt_es256") {
			try {
				const config = JSON.parse(authMethod.credential);
				const jwt = await signES256JWT({
					privateKey: config.privateKey,
					keyId: config.keyId,
					issuerId: config.issuerId,
					audience: config.audience,
					expiresInSeconds: config.expiresInSeconds,
				});
				headers.set("Authorization", `Bearer ${jwt}`);
			} catch (err) {
				console.error("[gateway] ✗ JWT signing failed:", err);
				return Response.json(
					{ error: "JWT signing failed" },
					{ status: 500 },
				);
			}
		} else if (authMethod.type === "oauth2_service_account") {
			try {
				const config = JSON.parse(authMethod.credential);
				const accessToken = await getServiceAccountToken({
					privateKey: config.private_key,
					clientEmail: config.client_email,
					scopes: config.scopes ?? "https://www.googleapis.com/auth/devstorage.read_only",
					tokenUri: config.token_uri,
				});
				headers.set("Authorization", `Bearer ${accessToken}`);
			} catch (err) {
				console.error("[gateway] ✗ OAuth2 token exchange failed:", err);
				return Response.json(
					{ error: "OAuth2 token exchange failed" },
					{ status: 500 },
				);
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
		if (lower === "transfer-encoding" || lower === "content-encoding") continue;
		responseHeaders.set(key, value);
	}

	const body = await upstreamResponse.arrayBuffer();
	responseHeaders.set("Content-Length", String(body.byteLength));

	return new Response(body, {
		status: upstreamResponse.status,
		headers: responseHeaders,
	});
}

/**
 * Legacy wrapper that resolves target + proxies in one call.
 * Used by existing tests.
 */
export async function proxyRequest(
	token: Token,
	targetSlug: string,
	subPath: string,
	request: Request,
): Promise<Response> {
	const result = await resolveGatewayTarget(token, targetSlug);
	if ("error" in result) return result.error;
	return proxyToTarget(result.target, subPath, request);
}
