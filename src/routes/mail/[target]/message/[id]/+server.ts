import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { resolveMailTarget } from "../../../resolve";
import { getMessage } from "$lib/server/services/mail";
import { logRequest } from "$lib/server/services/audit";

export const GET: RequestHandler = async ({ request, params, url, getClientAddress }) => {
	const start = Date.now();
	const clientIp = getClientAddress();
	const { token, target, config, credential } = await resolveMailTarget(request, params.target);

	const uid = parseInt(params.id, 10);
	if (isNaN(uid)) throw error(400, "Invalid message UID");

	const folder = url.searchParams.get("folder") ?? undefined;

	try {
		const message = await getMessage(config, credential, { uid, folder });

		if (!message) {
			logRequest({
				tokenId: token.id,
				tokenName: token.name,
				targetId: target.id,
				targetSlug: target.slug,
				type: "mail",
				method: "read",
				path: `${folder ?? "INBOX"}/${uid}`,
				statusCode: 404,
				clientIp,
				durationMs: Date.now() - start,
			});
			throw error(404, "Message not found");
		}

		logRequest({
			tokenId: token.id,
			tokenName: token.name,
			targetId: target.id,
			targetSlug: target.slug,
			type: "mail",
			method: "read",
			path: `${folder ?? "INBOX"}/${uid}`,
			statusCode: 200,
			clientIp,
			durationMs: Date.now() - start,
		});

		return Response.json(message);
	} catch (err) {
		if ((err as { status?: number }).status) throw err;
		const message = err instanceof Error ? err.message : "Failed to fetch message";

		logRequest({
			tokenId: token.id,
			tokenName: token.name,
			targetId: target.id,
			targetSlug: target.slug,
			type: "mail",
			method: "read",
			path: `${folder ?? "INBOX"}/${uid}`,
			statusCode: 502,
			clientIp,
			durationMs: Date.now() - start,
		});

		throw error(502, message);
	}
};
