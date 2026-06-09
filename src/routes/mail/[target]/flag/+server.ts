import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { resolveMailTarget } from "../../resolve";
import { flagMessage } from "$lib/server/services/mail";
import { logRequest } from "$lib/server/services/audit";

export const POST: RequestHandler = async ({ request, params, getClientAddress }) => {
	const start = Date.now();
	const clientIp = getClientAddress();
	const { token, target, config, credential } = await resolveMailTarget(request, params.target);

	const body = await request.json().catch(() => null);
	if (!body || typeof body !== "object") throw error(400, "Request body is required");
	if (typeof body.uid !== "number") throw error(400, "uid is required");

	const folder = typeof body.folder === "string" ? body.folder : undefined;
	const pathContext = `${folder ?? "INBOX"}/${body.uid}`;

	try {
		await flagMessage(config, credential, {
			uid: body.uid,
			folder,
			add: Array.isArray(body.add) ? body.add : undefined,
			remove: Array.isArray(body.remove) ? body.remove : undefined,
		});

		logRequest({
			tokenId: token.id,
			tokenName: token.name,
			targetId: target.id,
			targetSlug: target.slug,
			type: "mail",
			method: "flag",
			path: pathContext,
			statusCode: 200,
			clientIp,
			durationMs: Date.now() - start,
		});

		return Response.json({ success: true });
	} catch (err) {
		const message = err instanceof Error ? err.message : "Failed to flag message";

		logRequest({
			tokenId: token.id,
			tokenName: token.name,
			targetId: target.id,
			targetSlug: target.slug,
			type: "mail",
			method: "flag",
			path: pathContext,
			statusCode: 502,
			clientIp,
			durationMs: Date.now() - start,
		});

		throw error(502, message);
	}
};
