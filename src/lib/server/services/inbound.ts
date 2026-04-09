import { randomBytes, createHmac, timingSafeEqual } from "node:crypto";
import { and, eq, gt, isNull, lt } from "drizzle-orm";
import { db } from "../db";
import { inboundEvents, tokens } from "../db/schema";

export function generateWebhookKey(): string {
	return `whk_${randomBytes(24).toString("hex")}`;
}

export function generateEventId(): string {
	return `evt_${randomBytes(8).toString("hex")}`;
}

/**
 * Timing-safe HMAC-SHA256 signature verification.
 * Supports both "sha256=<hex>" (GitHub style) and plain hex.
 */
export function verifySignature(
	rawBody: string,
	signatureHeader: string,
	secret: string,
): boolean {
	const receivedSig = signatureHeader.startsWith("sha256=")
		? signatureHeader.slice(7)
		: signatureHeader;
	const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
	try {
		return timingSafeEqual(Buffer.from(receivedSig), Buffer.from(expected));
	} catch {
		return false;
	}
}

export async function getTokenByWebhookKey(webhookKey: string) {
	const [token] = await db
		.select()
		.from(tokens)
		.where(
			and(
				eq(tokens.webhookKey, webhookKey),
				isNull(tokens.revokedAt),
			),
		)
		.limit(1);
	return token ?? null;
}

export async function createInboundEvent(data: {
	tokenId: string;
	channel: string;
	payload: unknown;
	headers: Record<string, string>;
	sourceIp: string | null;
	eventType: string | null;
}) {
	const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
	const [event] = await db
		.insert(inboundEvents)
		.values({
			id: generateEventId(),
			...data,
			status: "pending",
			expiresAt,
		})
		.returning({ id: inboundEvents.id });
	return event;
}

export async function getPendingEvents(tokenId: string, channel?: string, limit = 20) {
	const conditions: ReturnType<typeof eq>[] = [
		eq(inboundEvents.tokenId, tokenId),
		eq(inboundEvents.status, "pending"),
		gt(inboundEvents.expiresAt, new Date()),
	];
	if (channel) conditions.push(eq(inboundEvents.channel, channel));

	return db
		.select()
		.from(inboundEvents)
		.where(and(...conditions))
		.orderBy(inboundEvents.receivedAt)
		.limit(Math.min(limit, 100));
}

export async function ackEvent(id: string, tokenId: string) {
	const [updated] = await db
		.update(inboundEvents)
		.set({ status: "acked", ackedAt: new Date() })
		.where(
			and(
				eq(inboundEvents.id, id),
				eq(inboundEvents.tokenId, tokenId),
				eq(inboundEvents.status, "pending"),
			),
		)
		.returning({ id: inboundEvents.id });
	return updated ?? null;
}

export async function enableWebhook(tokenId: string) {
	const webhookKey = generateWebhookKey();
	const [updated] = await db
		.update(tokens)
		.set({ webhookKey, updatedAt: new Date() })
		.where(eq(tokens.id, tokenId))
		.returning({ webhookKey: tokens.webhookKey });
	return updated ?? null;
}

export async function disableWebhook(tokenId: string) {
	const [updated] = await db
		.update(tokens)
		.set({ webhookKey: null, webhookSecret: null, updatedAt: new Date() })
		.where(eq(tokens.id, tokenId))
		.returning({ id: tokens.id });
	return updated ?? null;
}

export async function setWebhookSecret(tokenId: string, secret: string | null) {
	const [updated] = await db
		.update(tokens)
		.set({ webhookSecret: secret, updatedAt: new Date() })
		.where(eq(tokens.id, tokenId))
		.returning({ id: tokens.id });
	return updated ?? null;
}

export async function purgeOldEvents(olderThanMs: number) {
	const cutoff = new Date(Date.now() - olderThanMs);
	const toDelete = await db
		.select({ id: inboundEvents.id })
		.from(inboundEvents)
		.where(lt(inboundEvents.receivedAt, cutoff));
	if (toDelete.length === 0) return 0;
	await db.delete(inboundEvents).where(lt(inboundEvents.receivedAt, cutoff));
	return toDelete.length;
}
