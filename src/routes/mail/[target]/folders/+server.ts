import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { resolveMailTarget } from "../../resolve";
import { listFolders } from "$lib/server/services/mail";
import { logRequest } from "$lib/server/services/audit";

export const GET: RequestHandler = async ({ request, params, getClientAddress }) => {
	const start = Date.now();
	const clientIp = getClientAddress();
	const { token, target, config, credential } = await resolveMailTarget(request, params.target);

	try {
		const folders = await listFolders(config, credential);

		logRequest({
			tokenId: token.id,
			tokenName: token.name,
			targetId: target.id,
			targetSlug: target.slug,
			type: "mail",
			method: "folders",
			path: null,
			statusCode: 200,
			clientIp,
			durationMs: Date.now() - start,
		});

		return Response.json({ folders });
	} catch (err) {
		const message = err instanceof Error ? err.message : "Failed to list folders";

		logRequest({
			tokenId: token.id,
			tokenName: token.name,
			targetId: target.id,
			targetSlug: target.slug,
			type: "mail",
			method: "folders",
			path: null,
			statusCode: 502,
			clientIp,
			durationMs: Date.now() - start,
		});

		throw error(502, message);
	}
};
