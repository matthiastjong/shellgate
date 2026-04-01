import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireBearer } from "$lib/server/api-auth";
import { getPendingEvents } from "$lib/server/services/inbound";

export const GET: RequestHandler = async ({ request, url }) => {
	const token = await requireBearer(request);

	const channel = url.searchParams.get("channel") ?? undefined;
	const limitParam = url.searchParams.get("limit");
	const limit = limitParam ? Math.min(parseInt(limitParam) || 20, 100) : 20;

	const events = await getPendingEvents(token.id, channel, limit);
	return json({ events });
};
