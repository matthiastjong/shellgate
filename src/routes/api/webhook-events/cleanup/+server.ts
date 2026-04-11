import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireAdmin } from "$lib/server/api-auth";
import { cleanupExpiredEvents } from "$lib/server/services/webhook-events";

export const POST: RequestHandler = async ({ request }) => {
	await requireAdmin(request);
	const deleted = await cleanupExpiredEvents();
	return json({ deleted });
};
