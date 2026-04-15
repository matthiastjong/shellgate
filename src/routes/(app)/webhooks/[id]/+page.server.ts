import { error, fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { getEndpoint, updateEndpoint, updateInstructions } from "$lib/server/services/webhook-endpoints";
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

	return {
		endpoint,
		tokenName: token?.name ?? "Unknown",
		events,
	};
};

export const actions = {
	updateSettings: async ({ request, params }) => {
		const formData = await request.formData();
		const secret = formData.get("secret")?.toString()?.trim() || null;
		const signatureHeader = formData.get("signatureHeader")?.toString()?.trim() || null;
		const endpoint = await getEndpoint(params.id);
		if (!endpoint) return fail(404, { error: "Endpoint not found" });
		await updateEndpoint(endpoint.id, { secret, signatureHeader });
		return { updated: true };
	},
	saveInstructions: async ({ request, params }) => {
		const data = await request.formData();
		const instructions = data.get("instructions")?.toString()?.trim() || null;
		const endpoint = await getEndpoint(params.id);
		if (!endpoint) return fail(404, { error: "Endpoint not found" });
		await updateInstructions(endpoint.id, instructions);
		return { saved: true };
	},
} satisfies Actions;
