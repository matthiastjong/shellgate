import { randomBytes } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { db } from "../db";
import { webhookEndpoints, tokens } from "../db/schema";

function generateSlug(): string {
	return `wh_${randomBytes(24).toString("hex")}`;
}

export async function createEndpoint(
	tokenId: string,
	data: { name: string; secret?: string; signatureHeader?: string },
) {
	const slug = generateSlug();
	const [row] = await db
		.insert(webhookEndpoints)
		.values({
			tokenId,
			slug,
			name: data.name,
			secret: data.secret ?? null,
			signatureHeader: data.signatureHeader ?? null,
		})
		.returning();
	return row;
}

export async function listEndpoints(tokenId?: string) {
	const query = db
		.select({
			id: webhookEndpoints.id,
			tokenId: webhookEndpoints.tokenId,
			tokenName: tokens.name,
			slug: webhookEndpoints.slug,
			name: webhookEndpoints.name,
			signatureHeader: webhookEndpoints.signatureHeader,
			handlingInstructions: webhookEndpoints.handlingInstructions,
			enabled: webhookEndpoints.enabled,
			createdAt: webhookEndpoints.createdAt,
			updatedAt: webhookEndpoints.updatedAt,
		})
		.from(webhookEndpoints)
		.leftJoin(tokens, eq(webhookEndpoints.tokenId, tokens.id))
		.orderBy(desc(webhookEndpoints.createdAt));

	if (tokenId) {
		return query.where(eq(webhookEndpoints.tokenId, tokenId));
	}
	return query;
}

export async function getEndpoint(id: string) {
	const [row] = await db
		.select()
		.from(webhookEndpoints)
		.where(eq(webhookEndpoints.id, id))
		.limit(1);
	return row ?? null;
}

export async function getEndpointBySlug(slug: string) {
	const [row] = await db
		.select()
		.from(webhookEndpoints)
		.where(eq(webhookEndpoints.slug, slug))
		.limit(1);
	return row ?? null;
}

export async function updateInstructions(id: string, instructions: string | null) {
	const [row] = await db
		.update(webhookEndpoints)
		.set({ handlingInstructions: instructions, updatedAt: new Date() })
		.where(eq(webhookEndpoints.id, id))
		.returning();
	return row ?? null;
}

export async function deleteEndpoint(id: string) {
	await db.delete(webhookEndpoints).where(eq(webhookEndpoints.id, id));
}
