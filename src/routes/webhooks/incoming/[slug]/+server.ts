import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { getEndpointBySlug } from "$lib/server/services/webhook-endpoints";
import { createEvent } from "$lib/server/services/webhook-events";
import { verifySignature } from "$lib/server/utils/hmac";

export const POST: RequestHandler = async ({ params, request }) => {
	console.log(`[webhook:incoming] POST /webhooks/incoming/${params.slug}`);
	console.log(`[webhook:incoming] Method: ${request.method}, Content-Type: ${request.headers.get("content-type")}, Content-Length: ${request.headers.get("content-length")}`);

	const endpoint = await getEndpointBySlug(params.slug);
	if (!endpoint) {
		console.log(`[webhook:incoming] Endpoint not found for slug: ${params.slug}`);
		throw error(404, "Webhook endpoint not found");
	}
	if (!endpoint.enabled) {
		console.log(`[webhook:incoming] Endpoint disabled: ${endpoint.id} (${endpoint.name})`);
		throw error(404, "Webhook endpoint not found");
	}
	console.log(`[webhook:incoming] Endpoint found: ${endpoint.id} (${endpoint.name}), tokenId: ${endpoint.tokenId}`);

	const contentLength = parseInt(request.headers.get("content-length") ?? "0");
	if (contentLength > 1_048_576) {
		console.log(`[webhook:incoming] Payload too large: ${contentLength} bytes`);
		throw error(413, "Payload too large (max 1MB)");
	}

	const rawBody = await request.text();
	console.log(`[webhook:incoming] Body length: ${rawBody.length} chars`);
	if (rawBody.length > 1_048_576) throw error(413, "Payload too large (max 1MB)");

	if (endpoint.secret && endpoint.signatureHeader) {
		const signature = request.headers.get(endpoint.signatureHeader);
		console.log(`[webhook:incoming] Signature verification: header=${endpoint.signatureHeader}, present=${!!signature}`);
		if (!signature) {
			console.log(`[webhook:incoming] Missing signature header: ${endpoint.signatureHeader}`);
			throw error(401, "Missing signature header");
		}
		if (!verifySignature(endpoint.secret, rawBody, signature)) {
			console.log(`[webhook:incoming] Invalid signature`);
			throw error(401, "Invalid signature");
		}
		console.log(`[webhook:incoming] Signature verified OK`);
	} else {
		console.log(`[webhook:incoming] No signature verification configured`);
	}

	let body: unknown;
	try {
		body = JSON.parse(rawBody);
		console.log(`[webhook:incoming] Body parsed as JSON`);
	} catch {
		body = rawBody;
		console.log(`[webhook:incoming] Body kept as raw text`);
	}

	const headers: Record<string, string> = {};
	for (const [key, value] of request.headers.entries()) {
		if (key.startsWith("x-") || key === "content-type") {
			headers[key] = value;
		}
	}

	try {
		const event = await createEvent(endpoint.id, headers, body);
		console.log(`[webhook:incoming] Event created: ${event.id}, status: ${event.status}, expiresAt: ${event.expiresAt}`);
		return json({ ok: true });
	} catch (err) {
		console.error(`[webhook:incoming] Failed to create event:`, err);
		throw error(500, "Failed to store webhook event");
	}
};
