import { and, eq, ilike, or, inArray, asc } from "drizzle-orm";
import { db } from "../db";
import { vaultItems, vaultItemFields, tokenVaultPermissions, vaults } from "../db/schema";
import { encrypt, decrypt } from "../utils/crypto";
import { isUniqueViolation } from "../utils/db-error";

function slugify(name: string): string {
	return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function deriveAllowedOrigins(domain: string): string[] {
	return [`https://${domain}`, `https://*.${domain}`];
}

type FieldInput = { name: string; value: string; sensitive?: boolean };

export async function createItem(
	vaultId: string,
	data: { name: string; domain?: string; description?: string; allowedOrigins?: string[]; fields?: FieldInput[] },
) {
	const slug = slugify(data.name);
	const allowedOrigins = data.allowedOrigins ?? (data.domain ? deriveAllowedOrigins(data.domain) : null);

	let item;
	try {
		[item] = await db.insert(vaultItems).values({
			vaultId, name: data.name, slug, domain: data.domain ?? null,
			description: data.description ?? null, allowedOrigins,
		}).returning();
	} catch (err: unknown) {
		if (isUniqueViolation(err)) throw new Error("slug already exists");
		throw err;
	}

	if (data.fields?.length) {
		await db.insert(vaultItemFields).values(
			data.fields.map((f, i) => ({
				itemId: item.id, name: f.name, encryptedValue: encrypt(f.value),
				sensitive: f.sensitive ?? true, sortOrder: i,
			})),
		);
	}

	return item;
}

export async function listItems(vaultId: string) {
	return db.select().from(vaultItems).where(eq(vaultItems.vaultId, vaultId)).orderBy(asc(vaultItems.name));
}

export async function getItem(vaultId: string, slug: string) {
	const [item] = await db.select().from(vaultItems)
		.where(and(eq(vaultItems.vaultId, vaultId), eq(vaultItems.slug, slug))).limit(1);
	if (!item) return null;

	const fields = await db.select().from(vaultItemFields)
		.where(eq(vaultItemFields.itemId, item.id)).orderBy(asc(vaultItemFields.sortOrder));

	return {
		...item,
		fields: fields.map((f) => ({
			id: f.id, name: f.name, sensitive: f.sensitive, sortOrder: f.sortOrder,
			value: f.sensitive ? undefined : decrypt(f.encryptedValue),
		})),
	};
}

export async function getItemById(id: string) {
	const [item] = await db.select().from(vaultItems).where(eq(vaultItems.id, id)).limit(1);
	return item ?? null;
}

export async function updateItem(
	id: string,
	data: { name?: string; domain?: string | null; description?: string | null; allowedOrigins?: string[] | null },
) {
	const [row] = await db.update(vaultItems).set({ ...data, updatedAt: new Date() })
		.where(eq(vaultItems.id, id)).returning();
	return row ?? null;
}

export async function deleteItem(id: string) {
	await db.delete(vaultItems).where(eq(vaultItems.id, id));
}

export async function addField(itemId: string, data: { name: string; value: string; sensitive?: boolean }) {
	try {
		const [row] = await db.insert(vaultItemFields).values({
			itemId, name: data.name, encryptedValue: encrypt(data.value), sensitive: data.sensitive ?? true,
		}).returning();
		return row;
	} catch (err: unknown) {
		if (isUniqueViolation(err)) throw new Error("field name already exists");
		throw err;
	}
}

export async function updateField(id: string, data: { value?: string; sensitive?: boolean }) {
	const updates: Record<string, unknown> = {};
	if (data.value !== undefined) updates.encryptedValue = encrypt(data.value);
	if (data.sensitive !== undefined) updates.sensitive = data.sensitive;

	const [row] = await db.update(vaultItemFields).set(updates).where(eq(vaultItemFields.id, id)).returning();
	return row ?? null;
}

export async function deleteField(id: string) {
	await db.delete(vaultItemFields).where(eq(vaultItemFields.id, id));
}

export async function getFieldValue(itemId: string, fieldName: string): Promise<string | null> {
	const [field] = await db.select().from(vaultItemFields)
		.where(and(eq(vaultItemFields.itemId, itemId), eq(vaultItemFields.name, fieldName))).limit(1);
	if (!field) return null;
	return decrypt(field.encryptedValue);
}

export async function searchItems(tokenId: string, query: string) {
	const permissions = await db.select({ vaultId: tokenVaultPermissions.vaultId })
		.from(tokenVaultPermissions).where(eq(tokenVaultPermissions.tokenId, tokenId));
	if (permissions.length === 0) return [];

	const vaultIds = permissions.map((p) => p.vaultId);
	const pattern = `%${query}%`;

	const items = await db.select({
		id: vaultItems.id, vaultId: vaultItems.vaultId, vaultSlug: vaults.slug,
		name: vaultItems.name, slug: vaultItems.slug, domain: vaultItems.domain,
		description: vaultItems.description, allowedOrigins: vaultItems.allowedOrigins,
	}).from(vaultItems).innerJoin(vaults, eq(vaultItems.vaultId, vaults.id))
		.where(and(
			inArray(vaultItems.vaultId, vaultIds),
			or(ilike(vaultItems.name, pattern), ilike(vaultItems.domain, pattern), ilike(vaultItems.description, pattern)),
		));

	const results = await Promise.all(items.map(async (item) => {
		const fields = await db.select().from(vaultItemFields)
			.where(eq(vaultItemFields.itemId, item.id)).orderBy(asc(vaultItemFields.sortOrder));
		return {
			handle: `${item.vaultSlug}/${item.slug}`,
			name: item.name, domain: item.domain, description: item.description,
			allowedOrigins: item.allowedOrigins,
			fields: fields.map((f) => ({
				name: f.name, sensitive: f.sensitive,
				value: f.sensitive ? undefined : decrypt(f.encryptedValue),
			})),
		};
	}));

	return results;
}
