import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { targets, tokenPermissions } from "../db/schema";
import { isUniqueViolation } from "../utils/db-error";

export async function listPermissions(tokenId: string) {
	return db
		.select({
			id: tokenPermissions.id,
			tokenId: tokenPermissions.tokenId,
			targetId: tokenPermissions.targetId,
			createdAt: tokenPermissions.createdAt,
			target: {
				id: targets.id,
				name: targets.name,
				slug: targets.slug,
				type: targets.type,
				enabled: targets.enabled,
			},
		})
		.from(tokenPermissions)
		.innerJoin(targets, eq(tokenPermissions.targetId, targets.id))
		.where(eq(tokenPermissions.tokenId, tokenId));
}

export async function addPermission(tokenId: string, targetId: string) {
	try {
		const [row] = await db
			.insert(tokenPermissions)
			.values({ tokenId, targetId })
			.returning();
		return row;
	} catch (err: unknown) {
		if (isUniqueViolation(err)) {
			throw new Error("permission already exists");
		}
		throw err;
	}
}

export async function removePermission(tokenId: string, targetId: string) {
	const [existing] = await db
		.select()
		.from(tokenPermissions)
		.where(
			and(
				eq(tokenPermissions.tokenId, tokenId),
				eq(tokenPermissions.targetId, targetId),
			),
		)
		.limit(1);

	if (!existing) return null;

	await db
		.delete(tokenPermissions)
		.where(eq(tokenPermissions.id, existing.id));

	return { id: existing.id, deleted: true };
}

export async function hasPermission(
	tokenId: string,
	targetId: string,
): Promise<boolean> {
	const [row] = await db
		.select({ id: tokenPermissions.id })
		.from(tokenPermissions)
		.where(
			and(
				eq(tokenPermissions.tokenId, tokenId),
				eq(tokenPermissions.targetId, targetId),
			),
		)
		.limit(1);

	return !!row;
}
