import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireBearer } from "$lib/server/api-auth";
import { ackEvent } from "$lib/server/services/inbound";

export const POST: RequestHandler = async ({ params, request }) => {
	const token = await requireBearer(request);

	const result = await ackEvent(params.id, token.id);
	if (!result) throw error(404, "Event not found or already acked");

	return json({ ok: true });
};
