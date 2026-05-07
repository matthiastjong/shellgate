import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { tokenVaultPermissions, vaults } from "../db/schema";
import { isUniqueViolation } from "../utils/db-error";

export async function listVaultPermissions(tokenId: string) {
	return db.select({
		id: tokenVaultPermissions.id, tokenId: tokenVaultPermissions.tokenId,
		vaultId: tokenVaultPermissions.vaultId, createdAt: tokenVaultPermissions.createdAt,
		vault: { id: vaults.id, name: vaults.name, slug: vaults.slug },
	}).from(tokenVaultPermissions)
		.innerJoin(vaults, eq(tokenVaultPermissions.vaultId, vaults.id))
		.where(eq(tokenVaultPermissions.tokenId, tokenId));
}

export async function addVaultPermission(tokenId: string, vaultId: string) {
	try {
		const [row] = await db.insert(tokenVaultPermissions).values({ tokenId, vaultId }).returning();
		return row;
	} catch (err: unknown) {
		if (isUniqueViolation(err)) throw new Error("permission already exists");
		throw err;
	}
}

export async function removeVaultPermission(tokenId: string, vaultId: string) {
	const [existing] = await db.select().from(tokenVaultPermissions)
		.where(and(eq(tokenVaultPermissions.tokenId, tokenId), eq(tokenVaultPermissions.vaultId, vaultId))).limit(1);
	if (!existing) return null;
	await db.delete(tokenVaultPermissions).where(eq(tokenVaultPermissions.id, existing.id));
	return { id: existing.id, deleted: true };
}

export async function hasVaultPermission(tokenId: string, vaultId: string): Promise<boolean> {
	const [row] = await db.select({ id: tokenVaultPermissions.id }).from(tokenVaultPermissions)
		.where(and(eq(tokenVaultPermissions.tokenId, tokenId), eq(tokenVaultPermissions.vaultId, vaultId))).limit(1);
	return !!row;
}
