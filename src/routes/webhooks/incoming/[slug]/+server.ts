import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { getEndpointBySlug } from "$lib/server/services/webhook-endpoints";
import { createEvent } from "$lib/server/services/webhook-events";
import { verifySignature } from "$lib/server/utils/hmac";

export const POST: RequestHandler = async ({ params, request }) => {
	const endpoint = await getEndpointBySlug(params.slug);
	if (!endpoint) throw error(404, "Webhook endpoint not found");
	if (!endpoint.enabled) throw error(404, "Webhook endpoint not found");

	const contentLength = parseInt(request.headers.get("content-length") ?? "0");
	if (contentLength > 1_048_576) throw error(413, "Payload too large (max 1MB)");

	const rawBody = await request.text();
	if (rawBody.length > 1_048_576) throw error(413, "Payload too large (max 1MB)");

	if (endpoint.secret && endpoint.signatureHeader) {
		const signature = request.headers.get(endpoint.signatureHeader);
		if (!signature) throw error(401, "Missing signature header");
		if (!verifySignature(endpoint.secret, rawBody, signature)) {
			throw error(401, "Invalid signature");
		}
	}

	let body: unknown;
	try {
		body = JSON.parse(rawBody);
	} catch {
		body = rawBody;
	}

	const headers: Record<string, string> = {};
	for (const [key, value] of request.headers.entries()) {
		if (key.startsWith("x-") || key === "content-type") {
			headers[key] = value;
		}
	}

	await createEvent(endpoint.id, headers, body);

	return json({ ok: true });
};
