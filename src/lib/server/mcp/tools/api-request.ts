import type { Token } from "$lib/server/db/schema";
import { resolveGatewayTarget, proxyToTarget } from "$lib/server/services/gateway";
import { normalizeApiRequest, checkRequest } from "$lib/server/guard";
import { logRequest } from "$lib/server/services/audit";

export interface ApiRequestArgs {
	target: string;
	method: string;
	path: string;
	headers?: Record<string, string>;
	body?: unknown;
	approved?: boolean;
}

export async function apiRequest(token: Token, args: ApiRequestArgs) {
	const { target: targetSlug, method, path, headers = {}, body, approved = false } = args;

	const resolved = await resolveGatewayTarget(token, targetSlug);
	if ("error" in resolved) {
		const errBody = await resolved.error.json().catch(() => ({ error: "unknown error" }));
		throw new Error(errBody.error ?? "Failed to resolve target");
	}

	const { target } = resolved;

	// Guard check (unless pre-approved)
	if (!approved) {
		const normalized = normalizeApiRequest(method, path);
		const guardResult = await checkRequest(normalized);

		if (guardResult.action === "block") {
			logRequest({
				tokenId: token.id,
				tokenName: token.name,
				targetId: target.id,
				targetSlug: target.slug,
				type: "gateway",
				method,
				path,
				statusCode: 403,
				clientIp: "mcp",
				durationMs: null,
				guardAction: "block",
				guardReason: guardResult.reason,
			});
			return {
				status: "blocked",
				reason: guardResult.reason,
				matched: guardResult.matched,
			};
		}

		if (guardResult.action === "approval_required") {
			logRequest({
				tokenId: token.id,
				tokenName: token.name,
				targetId: target.id,
				targetSlug: target.slug,
				type: "gateway",
				method,
				path,
				statusCode: 202,
				clientIp: "mcp",
				durationMs: null,
				guardAction: "approval_required",
				guardReason: guardResult.reason,
			});
			return {
				status: "approval_required",
				reason: guardResult.reason,
				matched: guardResult.matched,
				request: { type: "api", method, path },
				next_action:
					"STOP. Do NOT re-send this request yet. Present the reason to the user, wait for their explicit approval, then re-call this tool with approved: true.",
			};
		}
	}

	// Build the proxy request
	const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
	const requestUrl = `http://mcp-internal/gateway/${targetSlug}/${normalizedPath}`;
	const requestInit: RequestInit = {
		method: method.toUpperCase(),
		headers: new Headers(headers),
	};

	if (body !== undefined && method.toUpperCase() !== "GET" && method.toUpperCase() !== "HEAD") {
		const bodyStr = typeof body === "string" ? body : JSON.stringify(body);
		(requestInit.headers as Headers).set("Content-Type", "application/json");
		requestInit.body = bodyStr;
	}

	const proxyRequest = new Request(requestUrl, requestInit);

	const start = Date.now();
	const response = await proxyToTarget(target, normalizedPath, proxyRequest);
	const durationMs = Date.now() - start;

	logRequest({
		tokenId: token.id,
		tokenName: token.name,
		targetId: target.id,
		targetSlug: target.slug,
		type: "gateway",
		method,
		path,
		statusCode: response.status,
		clientIp: "mcp",
		durationMs,
		guardAction: approved ? "approved" : "allow",
	});

	// Parse response
	const responseHeaders: Record<string, string> = {};
	for (const [key, value] of response.headers.entries()) {
		responseHeaders[key] = value;
	}

	let responseBody: unknown;
	const contentType = response.headers.get("content-type") ?? "";
	if (contentType.includes("application/json")) {
		responseBody = await response.json().catch(() => null);
	} else {
		responseBody = await response.text();
	}

	return {
		status: response.status,
		headers: responseHeaders,
		body: responseBody,
	};
}
