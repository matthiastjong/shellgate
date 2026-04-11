import { error, fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { getEndpoint, updateInstructions } from "$lib/server/services/webhook-endpoints";
import { getTokenById } from "$lib/server/services/tokens";
import { db } from "$lib/server/db";
import { webhookEvents } from "$lib/server/db/schema";
import { desc, eq } from "drizzle-orm";

export const load: PageServerLoad = async ({ params }) => {
	const endpoint = await getEndpoint(params.id);
	if (!endpoint) throw error(404, "Webhook endpoint not found");

	const token = await getTokenById(endpoint.tokenId);

	const events = await db
		.select({
			id: webhookEvents.id,
			headers: webhookEvents.headers,
			body: webhookEvents.body,
			status: webhookEvents.status,
			receivedAt: webhookEvents.receivedAt,
			deliveredAt: webhookEvents.deliveredAt,
		})
		.from(webhookEvents)
		.where(eq(webhookEvents.endpointId, endpoint.id))
		.orderBy(desc(webhookEvents.receivedAt))
		.limit(50);

	// Strip secret before sending to browser — only send masked hint
	const { secret, ...safeEndpoint } = endpoint;
	const secretHint = secret
		? secret.length <= 8
			? "****"
			: `${secret.slice(0, 4)}...${secret.slice(-4)}`
		: null;

	return {
		endpoint: { ...safeEndpoint, secretHint },
		tokenName: token?.name ?? "Unknown",
		events,
	};
};

export const actions = {
	saveInstructions: async ({ request, params }) => {
		const data = await request.formData();
		const instructions = data.get("instructions")?.toString()?.trim() || null;
		const endpoint = await getEndpoint(params.id);
		if (!endpoint) return fail(404, { error: "Endpoint not found" });
		await updateInstructions(endpoint.id, instructions);
		return { saved: true };
	},
} satisfies Actions;
