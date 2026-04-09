import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireAdmin } from "$lib/server/api-auth";
import {
	enableWebhook,
	disableWebhook,
	setWebhookSecret,
} from "$lib/server/services/inbound";

export const POST: RequestHandler = async ({ params, request }) => {
	await requireAdmin(request);
	const result = await enableWebhook(params.id);
	if (!result) throw error(404, "Token not found");
	return json({ webhookKey: result.webhookKey });
};

export const DELETE: RequestHandler = async ({ params, request }) => {
	await requireAdmin(request);
	const result = await disableWebhook(params.id);
	if (!result) throw error(404, "Token not found");
	return json({ ok: true });
};

export const PATCH: RequestHandler = async ({ params, request }) => {
	await requireAdmin(request);
	const body = await request.json().catch(() => ({}));
	const secret = typeof body.secret === "string" ? body.secret.trim() || null : null;
	const result = await setWebhookSecret(params.id, secret);
	if (!result) throw error(404, "Token not found");
	return json({ ok: true });
};
