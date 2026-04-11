import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireAdmin } from "$lib/server/api-auth";
import { db } from "$lib/server/db";
import { webhookEvents, webhookEndpoints } from "$lib/server/db/schema";
import { and, desc, eq } from "drizzle-orm";

export const GET: RequestHandler = async ({ request, url }) => {
	await requireAdmin(request);

	const endpointId = url.searchParams.get("endpointId");
	const status = url.searchParams.get("status");
	const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50"), 200);
	const offset = parseInt(url.searchParams.get("offset") ?? "0");

	const conditions = [];
	if (endpointId) conditions.push(eq(webhookEvents.endpointId, endpointId));
	if (status) conditions.push(eq(webhookEvents.status, status as "pending" | "delivered" | "expired"));

	const events = await db
		.select({
			id: webhookEvents.id,
			endpointId: webhookEvents.endpointId,
			endpointName: webhookEndpoints.name,
			headers: webhookEvents.headers,
			body: webhookEvents.body,
			status: webhookEvents.status,
			receivedAt: webhookEvents.receivedAt,
			deliveredAt: webhookEvents.deliveredAt,
			expiresAt: webhookEvents.expiresAt,
		})
		.from(webhookEvents)
		.leftJoin(webhookEndpoints, eq(webhookEvents.endpointId, webhookEndpoints.id))
		.where(conditions.length > 0 ? and(...conditions) : undefined)
		.orderBy(desc(webhookEvents.receivedAt))
		.limit(limit)
		.offset(offset);

	return json(events);
};
