import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireBearer } from "$lib/server/api-auth";
import { proxyRequest } from "$lib/server/services/gateway";
import { ipMatchesAny } from "$lib/server/utils/cidr";

const handler: RequestHandler = async ({ request, params, getClientAddress }) => {
	const token = await requireBearer(request);

	// IP whitelist check
	if (token.allowedIps && token.allowedIps.length > 0) {
		const clientIp = getClientAddress();
		if (!ipMatchesAny(clientIp, token.allowedIps)) {
			throw error(403, "IP not allowed");
		}
	}

	return proxyRequest(token, params.target, params.path ?? "", request);
};

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const HEAD = handler;
export const OPTIONS = handler;
