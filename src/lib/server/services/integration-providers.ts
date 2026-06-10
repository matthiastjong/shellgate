import { eq } from "drizzle-orm";
import { db } from "../db";
import { integrationProviders } from "../db/schema";

function slugify(name: string): string {
	return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export async function createProvider(data: {
	name: string;
	type: string;
	clientId: string;
	clientSecret: string;
	scopes: string;
	authUrl: string;
	tokenUrl: string;
}) {
	const name = data.name.trim();
	if (!name) throw new Error("name is required");

	const slug = slugify(name);
	if (!slug) throw new Error("name must produce a valid slug");

	const [row] = await db
		.insert(integrationProviders)
		.values({
			name,
			slug,
			type: data.type,
			clientId: data.clientId,
			clientSecret: data.clientSecret,
			scopes: data.scopes,
			authUrl: data.authUrl,
			tokenUrl: data.tokenUrl,
		})
		.returning();

	return row;
}

export async function listProviders() {
	return db
		.select()
		.from(integrationProviders)
		.orderBy(integrationProviders.createdAt);
}

export async function getProviderById(id: string) {
	const [row] = await db
		.select()
		.from(integrationProviders)
		.where(eq(integrationProviders.id, id))
		.limit(1);

	return row ?? null;
}

export async function getProviderBySlug(slug: string) {
	const [row] = await db
		.select()
		.from(integrationProviders)
		.where(eq(integrationProviders.slug, slug))
		.limit(1);

	return row ?? null;
}

export async function getEnabledProviders() {
	return db
		.select()
		.from(integrationProviders)
		.where(eq(integrationProviders.enabled, true))
		.orderBy(integrationProviders.createdAt);
}

export async function updateProvider(
	id: string,
	data: Partial<{
		name: string;
		type: string;
		clientId: string;
		clientSecret: string;
		scopes: string;
		authUrl: string;
		tokenUrl: string;
		enabled: boolean;
	}>,
) {
	const updates: Record<string, unknown> = { updatedAt: new Date() };

	if (data.name !== undefined) {
		const name = data.name.trim();
		if (!name) throw new Error("name is required");
		updates.name = name;
		const slug = slugify(name);
		if (!slug) throw new Error("name must produce a valid slug");
		updates.slug = slug;
	}
	if (data.type !== undefined) updates.type = data.type;
	if (data.clientId !== undefined) updates.clientId = data.clientId;
	if (data.clientSecret !== undefined) updates.clientSecret = data.clientSecret;
	if (data.scopes !== undefined) updates.scopes = data.scopes;
	if (data.authUrl !== undefined) updates.authUrl = data.authUrl;
	if (data.tokenUrl !== undefined) updates.tokenUrl = data.tokenUrl;
	if (data.enabled !== undefined) updates.enabled = data.enabled;

	const [row] = await db
		.update(integrationProviders)
		.set(updates)
		.where(eq(integrationProviders.id, id))
		.returning();

	return row ?? null;
}

export async function deleteProvider(id: string) {
	const [row] = await db
		.delete(integrationProviders)
		.where(eq(integrationProviders.id, id))
		.returning();

	return row ?? null;
}
