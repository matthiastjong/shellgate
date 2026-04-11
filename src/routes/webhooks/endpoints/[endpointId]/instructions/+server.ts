import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireBearer } from "$lib/server/api-auth";
import { getEndpoint, updateInstructions } from "$lib/server/services/webhook-endpoints";

export const POST: RequestHandler = async ({ params, request }) => {
	const token = await requireBearer(request);
	const endpoint = await getEndpoint(params.endpointId);

	if (!endpoint) throw error(404, "Webhook endpoint not found");
	if (endpoint.tokenId !== token.id) throw error(403, "Not authorized");

	const body = await request.json().catch(() => ({}));
	const instructions = typeof body.instructions === "string" ? body.instructions.trim() : null;

	await updateInstructions(endpoint.id, instructions);
	return json({ ok: true });
};
