import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { resolveMailTarget } from "../../resolve";
import { createDraft } from "$lib/server/services/mail";
import { logRequest } from "$lib/server/services/audit";

export const POST: RequestHandler = async ({ request, params, getClientAddress }) => {
	const start = Date.now();
	const clientIp = getClientAddress();
	const { token, target, config, credential } = await resolveMailTarget(request, params.target);

	const body = await request.json().catch(() => null);
	if (!body || typeof body !== "object") throw error(400, "Request body is required");

	const recipients = body.to
		? Array.isArray(body.to)
			? body.to.join(", ")
			: String(body.to)
		: "(no recipients)";

	try {
		const result = await createDraft(config, credential, {
			to: body.to,
			subject: body.subject,
			text: body.text,
			html: body.html,
		});

		logRequest({
			tokenId: token.id,
			tokenName: token.name,
			targetId: target.id,
			targetSlug: target.slug,
			type: "mail",
			method: "draft",
			path: recipients,
			statusCode: 200,
			clientIp,
			durationMs: Date.now() - start,
		});

		return Response.json(result);
	} catch (err) {
		const message = err instanceof Error ? err.message : "Failed to create draft";

		logRequest({
			tokenId: token.id,
			tokenName: token.name,
			targetId: target.id,
			targetSlug: target.slug,
			type: "mail",
			method: "draft",
			path: recipients,
			statusCode: 502,
			clientIp,
			durationMs: Date.now() - start,
		});

		throw error(502, message);
	}
};
