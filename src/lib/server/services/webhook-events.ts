import { and, eq, inArray, lt } from "drizzle-orm";
import { db } from "../db";
import { webhookEndpoints, webhookEvents } from "../db/schema";

const EXPIRY_DAYS = 7;

export async function createEvent(
	endpointId: string,
	headers: Record<string, string>,
	body: unknown,
) {
	const now = new Date();
	const expiresAt = new Date(now.getTime() + EXPIRY_DAYS * 24 * 60 * 60 * 1000);

	const [row] = await db
		.insert(webhookEvents)
		.values({
			endpointId,
			headers,
			body,
			status: "pending",
			receivedAt: now,
			expiresAt,
		})
		.returning();
	return row;
}

export async function getPendingEvents(tokenId: string, endpointId?: string) {
	const conditions = [
		eq(webhookEvents.status, "pending"),
		eq(webhookEndpoints.tokenId, tokenId),
		eq(webhookEndpoints.enabled, true),
	];

	if (endpointId) {
		conditions.push(eq(webhookEvents.endpointId, endpointId));
	}

	return db
		.select({
			id: webhookEvents.id,
			endpointId: webhookEvents.endpointId,
			endpointName: webhookEndpoints.name,
			handlingInstructions: webhookEndpoints.handlingInstructions,
			headers: webhookEvents.headers,
			body: webhookEvents.body,
			receivedAt: webhookEvents.receivedAt,
		})
		.from(webhookEvents)
		.innerJoin(webhookEndpoints, eq(webhookEvents.endpointId, webhookEndpoints.id))
		.where(and(...conditions));
}

export async function acknowledgeEvents(tokenId: string, eventIds: string[]) {
	if (eventIds.length === 0) return 0;

	// Only acknowledge events that belong to this token's endpoints
	const ownedEndpoints = db
		.select({ id: webhookEndpoints.id })
		.from(webhookEndpoints)
		.where(eq(webhookEndpoints.tokenId, tokenId));

	const rows = await db
		.update(webhookEvents)
		.set({ status: "delivered", deliveredAt: new Date() })
		.where(
			and(
				inArray(webhookEvents.id, eventIds),
				eq(webhookEvents.status, "pending"),
				inArray(webhookEvents.endpointId, ownedEndpoints),
			),
		)
		.returning({ id: webhookEvents.id });

	return rows.length;
}

export async function cleanupExpiredEvents() {
	const rows = await db
		.delete(webhookEvents)
		.where(lt(webhookEvents.expiresAt, new Date()))
		.returning({ id: webhookEvents.id });
	return rows.length;
}
