import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireBearer } from "$lib/server/api-auth";
import { acknowledgeEvents } from "$lib/server/services/webhook-events";

export const POST: RequestHandler = async ({ request }) => {
	const token = await requireBearer(request);
	const body = await request.json().catch(() => ({}));

	const eventIds = Array.isArray(body.eventIds) ? body.eventIds : [];
	if (eventIds.length === 0) throw error(400, "eventIds is required");
	if (!eventIds.every((id: unknown) => typeof id === "string")) {
		throw error(400, "eventIds must be an array of strings");
	}

	const count = await acknowledgeEvents(token.id, eventIds);
	return json({ acknowledged: count });
};
