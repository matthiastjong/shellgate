import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { resolveMailTarget } from "../../resolve";
import { moveMessage } from "$lib/server/services/mail";
import { logRequest } from "$lib/server/services/audit";

export const POST: RequestHandler = async ({ request, params, getClientAddress }) => {
	const start = Date.now();
	const clientIp = getClientAddress();
	const { token, target, config, credential } = await resolveMailTarget(request, params.target);

	const body = await request.json().catch(() => null);
	if (!body || typeof body !== "object") throw error(400, "Request body is required");
	if (typeof body.uid !== "number") throw error(400, "uid is required");
	if (typeof body.from !== "string" || !body.from) throw error(400, "from folder is required");
	if (typeof body.to !== "string" || !body.to) throw error(400, "to folder is required");

	const pathContext = `${body.from}/${body.uid} -> ${body.to}`;

	try {
		await moveMessage(config, credential, { uid: body.uid, from: body.from, to: body.to });

		logRequest({
			tokenId: token.id,
			tokenName: token.name,
			targetId: target.id,
			targetSlug: target.slug,
			type: "mail",
			method: "move",
			path: pathContext,
			statusCode: 200,
			clientIp,
			durationMs: Date.now() - start,
		});

		return Response.json({ success: true });
	} catch (err) {
		const message = err instanceof Error ? err.message : "Failed to move message";

		logRequest({
			tokenId: token.id,
			tokenName: token.name,
			targetId: target.id,
			targetSlug: target.slug,
			type: "mail",
			method: "move",
			path: pathContext,
			statusCode: 502,
			clientIp,
			durationMs: Date.now() - start,
		});

		throw error(502, message);
	}
};
