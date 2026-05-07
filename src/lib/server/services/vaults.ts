import { desc, eq } from "drizzle-orm";
import { db } from "../db";
import { vaults } from "../db/schema";
import { isUniqueViolation } from "../utils/db-error";

function slugify(name: string): string {
	return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export async function createVault(data: { name: string; description?: string }) {
	const slug = slugify(data.name);
	try {
		const [row] = await db.insert(vaults).values({ name: data.name, slug, description: data.description ?? null }).returning();
		return row;
	} catch (err: unknown) {
		if (isUniqueViolation(err)) throw new Error("slug already exists");
		throw err;
	}
}

export async function listVaults() {
	return db.select().from(vaults).orderBy(desc(vaults.createdAt));
}

export async function getVault(id: string) {
	const [row] = await db.select().from(vaults).where(eq(vaults.id, id)).limit(1);
	return row ?? null;
}

export async function getVaultBySlug(slug: string) {
	const [row] = await db.select().from(vaults).where(eq(vaults.slug, slug)).limit(1);
	return row ?? null;
}

export async function updateVault(id: string, data: { name?: string; description?: string | null }) {
	const [row] = await db.update(vaults).set({ ...data, updatedAt: new Date() }).where(eq(vaults.id, id)).returning();
	return row ?? null;
}

export async function deleteVault(id: string) {
	await db.delete(vaults).where(eq(vaults.id, id));
}
