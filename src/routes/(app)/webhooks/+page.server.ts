import { fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { listEndpoints, createEndpoint, deleteEndpoint } from "$lib/server/services/webhook-endpoints";
import { listTokens } from "$lib/server/services/tokens";
import { db } from "$lib/server/db";
import { webhookEvents } from "$lib/server/db/schema";
import { eq, sql } from "drizzle-orm";

export const load: PageServerLoad = async () => {
	const [endpoints, tokensList] = await Promise.all([listEndpoints(), listTokens()]);

	const counts = await db
		.select({
			endpointId: webhookEvents.endpointId,
			count: sql<number>`count(*)::int`,
		})
		.from(webhookEvents)
		.where(eq(webhookEvents.status, "pending"))
		.groupBy(webhookEvents.endpointId);

	const countMap = new Map(counts.map((c) => [c.endpointId, c.count]));

	const endpointsWithCounts = endpoints.map((ep) => ({
		...ep,
		pendingCount: countMap.get(ep.id) ?? 0,
	}));

	return { endpoints: endpointsWithCounts, tokens: tokensList };
};

export const actions = {
	create: async ({ request }) => {
		const data = await request.formData();
		const tokenId = data.get("tokenId")?.toString() ?? "";
		const name = data.get("name")?.toString()?.trim() ?? "";
		const secret = data.get("secret")?.toString()?.trim() || undefined;
		const signatureHeader = data.get("signatureHeader")?.toString()?.trim() || undefined;

		if (!tokenId) return fail(400, { error: "API key is required" });
		if (!name) return fail(400, { error: "Name is required" });

		try {
			const endpoint = await createEndpoint(tokenId, { name, secret, signatureHeader });
			return { created: endpoint };
		} catch (err) {
			return fail(400, { error: err instanceof Error ? err.message : "Failed to create webhook" });
		}
	},

	delete: async ({ request }) => {
		const data = await request.formData();
		const id = data.get("id")?.toString() ?? "";
		if (!id) return fail(400, { error: "ID is required" });

		try {
			await deleteEndpoint(id);
			return { deleted: id };
		} catch (err) {
			return fail(500, { error: err instanceof Error ? err.message : "Failed to delete" });
		}
	},
} satisfies Actions;
