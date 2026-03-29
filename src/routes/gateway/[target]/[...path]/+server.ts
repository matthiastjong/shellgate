import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireBearer } from "$lib/server/api-auth";
import { resolveGatewayTarget, proxyToTarget } from "$lib/server/services/gateway";
import { ipMatchesAny } from "$lib/server/utils/cidr";
import { logRequest } from "$lib/server/services/audit";
import { normalizeApiRequest, checkRequest } from "$lib/server/guard";

const handler: RequestHandler = async ({ request, params, getClientAddress }) => {
	const token = await requireBearer(request);

	// IP whitelist check
	if (token.allowedIps && token.allowedIps.length > 0) {
		const clientIp = getClientAddress();
		if (!ipMatchesAny(clientIp, token.allowedIps)) {
			logRequest({
				tokenId: token.id,
				tokenName: token.name,
				targetId: null,
				targetSlug: params.target,
				type: "gateway",
				method: request.method,
				path: params.path ?? "",
				statusCode: 403,
				clientIp,
				durationMs: null,
			});
			throw error(403, "IP not allowed");
		}
	}

	// Resolve target before guard check so we have target.id
	const resolved = await resolveGatewayTarget(token, params.target);
	if ("error" in resolved) {
		logRequest({
			tokenId: token.id,
			tokenName: token.name,
			targetId: null,
			targetSlug: params.target,
			type: "gateway",
			method: request.method,
			path: params.path ?? "",
			statusCode: resolved.error.status,
			clientIp: getClientAddress(),
			durationMs: null,
		});
		return resolved.error;
	}

	const { target } = resolved;

	// Guard check
	const isApproved = request.headers.get("X-Shellgate-Approved") === "true";

	if (!isApproved) {
		const normalized = normalizeApiRequest(request.method, params.path ?? "");
		const guardResult = await checkRequest(normalized);

		if (guardResult.action === "block") {
			logRequest({
				tokenId: token.id,
				tokenName: token.name,
				targetId: target.id,
				targetSlug: target.slug,
				type: "gateway",
				method: request.method,
				path: params.path ?? "",
				statusCode: 403,
				clientIp: getClientAddress(),
				durationMs: null,
				guardAction: "block",
				guardReason: guardResult.reason,
			});
			throw error(403, guardResult.reason);
		}

		if (guardResult.action === "approval_required") {
			logRequest({
				tokenId: token.id,
				tokenName: token.name,
				targetId: target.id,
				targetSlug: target.slug,
				type: "gateway",
				method: request.method,
				path: params.path ?? "",
				statusCode: 202,
				clientIp: getClientAddress(),
				durationMs: null,
				guardAction: "approval_required",
				guardReason: guardResult.reason,
			});
			return Response.json(
				{
					status: "approval_required",
					reason: guardResult.reason,
					matched: guardResult.matched,
					request: { type: "api", method: request.method, path: params.path },
					next_action:
						"STOP. Do NOT re-send this request yet. You MUST present the blocked request to the user, explain what it does and why it was flagged, then wait for the user to explicitly reply with approval. Only after the user responds confirming approval may you re-send the exact same request with the header X-Shellgate-Approved: true. If the user denies, abort. Never auto-approve.",
				},
				{ status: 202 },
			);
		}
	}

	const start = Date.now();
	const response = await proxyToTarget(target, params.path ?? "", request);
	const durationMs = Date.now() - start;

	logRequest({
		tokenId: token.id,
		tokenName: token.name,
		targetId: target.id,
		targetSlug: target.slug,
		type: "gateway",
		method: request.method,
		path: params.path ?? "",
		statusCode: response.status,
		clientIp: getClientAddress(),
		durationMs,
		guardAction: isApproved ? "approved" : "allow",
	});

	return response;
};

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const HEAD = handler;
export const OPTIONS = handler;
