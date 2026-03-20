import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireBearer } from "$lib/server/api-auth";
import { proxyRequest } from "$lib/server/services/gateway";
import { ipMatchesAny } from "$lib/server/utils/cidr";
import { logRequest } from "$lib/server/services/audit";

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

	const start = Date.now();
	const response = await proxyRequest(token, params.target, params.path ?? "", request);
	const durationMs = Date.now() - start;

	logRequest({
		tokenId: token.id,
		tokenName: token.name,
		targetId: null,
		targetSlug: params.target,
		type: "gateway",
		method: request.method,
		path: params.path ?? "",
		statusCode: response.status,
		clientIp: getClientAddress(),
		durationMs,
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
