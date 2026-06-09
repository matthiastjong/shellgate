import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { resolveMailTarget } from "../../resolve";
import { search } from "$lib/server/services/mail";
import { logRequest } from "$lib/server/services/audit";

export const POST: RequestHandler = async ({ request, params, getClientAddress }) => {
	const start = Date.now();
	const clientIp = getClientAddress();
	const { token, target, config, credential } = await resolveMailTarget(request, params.target);

	const body = await request.json().catch(() => null);
	if (!body || typeof body !== "object") throw error(400, "Request body is required");

	const query = {
		folder: typeof body.folder === "string" ? body.folder : undefined,
		from: typeof body.from === "string" ? body.from : undefined,
		to: typeof body.to === "string" ? body.to : undefined,
		subject: typeof body.subject === "string" ? body.subject : undefined,
		since: body.since ? new Date(body.since) : undefined,
		before: body.before ? new Date(body.before) : undefined,
		text: typeof body.text === "string" ? body.text : undefined,
		limit: typeof body.limit === "number" ? body.limit : undefined,
	};

	try {
		const messages = await search(config, credential, query);

		logRequest({
			tokenId: token.id,
			tokenName: token.name,
			targetId: target.id,
			targetSlug: target.slug,
			type: "mail",
			method: "search",
			path: query.folder ?? "INBOX",
			statusCode: 200,
			clientIp,
			durationMs: Date.now() - start,
		});

		return Response.json({ messages });
	} catch (err) {
		const message = err instanceof Error ? err.message : "Mail search failed";

		logRequest({
			tokenId: token.id,
			tokenName: token.name,
			targetId: target.id,
			targetSlug: target.slug,
			type: "mail",
			method: "search",
			path: query.folder ?? "INBOX",
			statusCode: 502,
			clientIp,
			durationMs: Date.now() - start,
		});

		throw error(502, message);
	}
};
