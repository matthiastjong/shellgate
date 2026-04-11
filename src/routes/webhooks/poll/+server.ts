import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireBearer } from "$lib/server/api-auth";
import { getPendingEvents } from "$lib/server/services/webhook-events";

export const GET: RequestHandler = async ({ request, url }) => {
	const token = await requireBearer(request);
	const endpointId = url.searchParams.get("endpointId") ?? undefined;
	const events = await getPendingEvents(token.id, endpointId);
	return json({ events });
};
