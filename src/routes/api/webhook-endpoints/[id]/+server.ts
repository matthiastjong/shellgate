import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireAdmin } from "$lib/server/api-auth";
import { getEndpoint, deleteEndpoint } from "$lib/server/services/webhook-endpoints";

export const GET: RequestHandler = async ({ request, params }) => {
	await requireAdmin(request);
	const endpoint = await getEndpoint(params.id);
	if (!endpoint) throw error(404, "Webhook endpoint not found");
	return json(endpoint);
};

export const DELETE: RequestHandler = async ({ request, params }) => {
	await requireAdmin(request);
	await deleteEndpoint(params.id);
	return json({ ok: true });
};
