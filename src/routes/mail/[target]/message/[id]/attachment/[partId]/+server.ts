import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { resolveMailTarget } from "../../../../../resolve";
import { getAttachment } from "$lib/server/services/mail";
import { logRequest } from "$lib/server/services/audit";

export const GET: RequestHandler = async ({ request, params, url, getClientAddress }) => {
	const start = Date.now();
	const clientIp = getClientAddress();
	const { token, target, config, credential } = await resolveMailTarget(request, params.target);

	const uid = parseInt(params.id, 10);
	if (isNaN(uid)) throw error(400, "Invalid message UID");

	const partId = parseInt(params.partId, 10);
	if (isNaN(partId)) throw error(400, "Invalid part ID");

	const folder = url.searchParams.get("folder") ?? undefined;

	try {
		const attachment = await getAttachment(config, credential, { uid, partId, folder });

		if (!attachment) {
			logRequest({
				tokenId: token.id,
				tokenName: token.name,
				targetId: target.id,
				targetSlug: target.slug,
				type: "mail",
				method: "attachment",
				path: `${folder ?? "INBOX"}/${uid}/attachment/${partId}`,
				statusCode: 404,
				clientIp,
				durationMs: Date.now() - start,
			});
			throw error(404, "Attachment not found");
		}

		logRequest({
			tokenId: token.id,
			tokenName: token.name,
			targetId: target.id,
			targetSlug: target.slug,
			type: "mail",
			method: "attachment",
			path: `${folder ?? "INBOX"}/${uid}/attachment/${partId}`,
			statusCode: 200,
			clientIp,
			durationMs: Date.now() - start,
		});

		const filename = attachment.filename ?? `attachment-${partId}`;
		return new Response(attachment.content.buffer as ArrayBuffer, {
			headers: {
				"Content-Type": attachment.contentType,
				"Content-Disposition": `attachment; filename="${filename}"`,
			},
		});
	} catch (err) {
		if ((err as { status?: number }).status) throw err;
		const message = err instanceof Error ? err.message : "Failed to fetch attachment";

		logRequest({
			tokenId: token.id,
			tokenName: token.name,
			targetId: target.id,
			targetSlug: target.slug,
			type: "mail",
			method: "attachment",
			path: `${folder ?? "INBOX"}/${uid}/attachment/${partId}`,
			statusCode: 502,
			clientIp,
			durationMs: Date.now() - start,
		});

		throw error(502, message);
	}
};
