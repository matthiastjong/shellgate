import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { resolveMailTarget } from "../../resolve";
import { send } from "$lib/server/services/mail";
import { logRequest } from "$lib/server/services/audit";

export const POST: RequestHandler = async ({ request, params, getClientAddress }) => {
	const start = Date.now();
	const clientIp = getClientAddress();
	const { token, target, config, credential } = await resolveMailTarget(request, params.target);

	const body = await request.json().catch(() => null);
	if (!body || typeof body !== "object") throw error(400, "Request body is required");
	if (!body.to) throw error(400, "to is required");
	if (!body.subject) throw error(400, "subject is required");

	const recipients = Array.isArray(body.to)
		? body.to.join(", ")
		: String(body.to);

	const isApproved = request.headers.get("X-Shellgate-Approved") === "true";

	if (!isApproved) {
		logRequest({
			tokenId: token.id,
			tokenName: token.name,
			targetId: target.id,
			targetSlug: target.slug,
			type: "mail",
			method: "send",
			path: recipients,
			statusCode: 202,
			clientIp,
			durationMs: Date.now() - start,
			guardAction: "approval_required",
			guardReason: "Sending email requires explicit user approval",
		});

		return Response.json(
			{
				status: "approval_required",
				reason: "Sending email requires explicit user approval",
				request: { type: "mail", action: "send", to: body.to, subject: body.subject },
				next_action:
					"STOP. Do NOT re-send this request yet. You MUST present the email details (recipients, subject, and body) to the user, explain what will be sent and why, then wait for the user to explicitly reply with approval. Only after the user responds confirming approval may you re-send the exact same request with the header X-Shellgate-Approved: true. If the user denies, abort. Never auto-approve.",
			},
			{ status: 202 },
		);
	}

	try {
		const result = await send(config, credential, {
			to: body.to,
			cc: body.cc,
			bcc: body.bcc,
			subject: body.subject,
			text: body.text,
			html: body.html,
			inReplyTo: body.inReplyTo,
		});

		logRequest({
			tokenId: token.id,
			tokenName: token.name,
			targetId: target.id,
			targetSlug: target.slug,
			type: "mail",
			method: "send",
			path: recipients,
			statusCode: 200,
			clientIp,
			durationMs: Date.now() - start,
			guardAction: "approved",
		});

		return Response.json(result);
	} catch (err) {
		const message = err instanceof Error ? err.message : "Failed to send email";

		logRequest({
			tokenId: token.id,
			tokenName: token.name,
			targetId: target.id,
			targetSlug: target.slug,
			type: "mail",
			method: "send",
			path: recipients,
			statusCode: 502,
			clientIp,
			durationMs: Date.now() - start,
			guardAction: "approved",
		});

		throw error(502, message);
	}
};
