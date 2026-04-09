import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import {
	getTokenByWebhookKey,
	createInboundEvent,
	verifySignature,
} from "$lib/server/services/inbound";
import { checkRateLimit } from "$lib/server/inbound-ratelimit";

const MAX_PAYLOAD_BYTES = 1 * 1024 * 1024; // 1MB

export const POST: RequestHandler = async ({ params, request }) => {
	const { webhookKey, channel } = params;

	if (!checkRateLimit(webhookKey)) {
		throw error(429, "Too many requests");
	}

	const contentLength = request.headers.get("content-length");
	if (contentLength && parseInt(contentLength) > MAX_PAYLOAD_BYTES) {
		throw error(413, "Payload too large");
	}

	const token = await getTokenByWebhookKey(webhookKey);
	if (!token) throw error(404, "Webhook not found");

	const rawBody = await request.text();
	if (rawBody.length > MAX_PAYLOAD_BYTES) throw error(413, "Payload too large");

	if (token.webhookSecret) {
		const sig =
			request.headers.get("x-hub-signature-256") ||
			request.headers.get("linear-signature") ||
			request.headers.get("stripe-signature") ||
			request.headers.get("x-signature-256") ||
			request.headers.get("x-webhook-signature");

		if (!sig || !verifySignature(rawBody, sig, token.webhookSecret)) {
			throw error(401, "Invalid signature");
		}
	}

	let payload: unknown;
	try {
		payload = JSON.parse(rawBody);
	} catch {
		throw error(400, "Invalid JSON");
	}

	const relevantPrefixes = ["x-", "linear-", "stripe-", "github-", "content-type"];
	const headers: Record<string, string> = {};
	for (const [key, value] of request.headers.entries()) {
		const lower = key.toLowerCase();
		if (relevantPrefixes.some((p) => lower.startsWith(p))) {
			headers[lower] = value;
		}
	}

	const eventType =
		request.headers.get("x-github-event") ||
		request.headers.get("linear-event") ||
		request.headers.get("stripe-event") ||
		null;

	const sourceIp =
		request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
		request.headers.get("x-real-ip") ||
		null;

	const event = await createInboundEvent({
		tokenId: token.id,
		channel,
		payload,
		headers,
		sourceIp,
		eventType,
	});

	return json({ ok: true, event_id: event.id }, { status: 202 });
};
