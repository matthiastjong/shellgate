import { fail } from "@sveltejs/kit";
import { sql } from "drizzle-orm";
import { db } from "$lib/server/db";
import { tokenPermissions } from "$lib/server/db/schema";
import { listTokens, createToken, renameToken, revokeToken, regenerateToken } from "$lib/server/services/tokens";
import { listTargets } from "$lib/server/services/targets";
import { addPermission } from "$lib/server/services/permissions";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async () => {
	try {
		const [tokens, targets] = await Promise.all([listTokens(), listTargets()]);

		let permCounts: { tokenId: string; count: number }[] = [];
		try {
			permCounts = await db
				.select({
					tokenId: tokenPermissions.tokenId,
					count: sql<number>`count(*)::int`,
				})
				.from(tokenPermissions)
				.groupBy(tokenPermissions.tokenId);
		} catch {
			// fallback to empty
		}

		const countMap = new Map(permCounts.map((p) => [p.tokenId, p.count]));

		return {
			tokens: tokens.map((t) => ({ ...t, targetCount: countMap.get(t.id) ?? 0 })),
			targets,
		};
	} catch {
		return { tokens: [], targets: [] };
	}
};

export const actions = {
	create: async ({ request }) => {
		const data = await request.formData();
		const name = data.get("name")?.toString()?.trim() ?? "";
		if (!name) return fail(400, { error: "Name is required" });
		if (name.length > 255) return fail(400, { error: "Name must be 255 characters or less" });

		const result = await createToken(name);

		// Grant permissions to selected targets
		const targetIds = data.get("targetIds")?.toString()?.trim() ?? "";
		if (targetIds) {
			const ids = targetIds.split(",").filter(Boolean);
			for (const targetId of ids) {
				try {
					await addPermission(result.token.id, targetId);
				} catch {
					// Don't fail the whole create if a permission fails
				}
			}
		}

		return { created: { ...result.token, token: result.plainToken, targetCount: targetIds ? targetIds.split(",").filter(Boolean).length : 0 } };
	},

	revoke: async ({ request }) => {
		const data = await request.formData();
		const id = data.get("id")?.toString() ?? "";
		if (!id) return fail(400, { error: "ID is required" });

		const result = await revokeToken(id);
		if (!result) return fail(404, { error: "Token not found" });
		return { revoked: id };
	},

	rename: async ({ request }) => {
		const data = await request.formData();
		const id = data.get("id")?.toString() ?? "";
		const name = data.get("name")?.toString()?.trim() ?? "";
		if (!name) return fail(400, { error: "Name is required" });
		if (name.length > 255) return fail(400, { error: "Name must be 255 characters or less" });

		const result = await renameToken(id, name);
		if (!result) return fail(404, { error: "Token not found" });
		return { renamed: { id, name } };
	},

	regenerate: async ({ request }) => {
		const data = await request.formData();
		const id = data.get("id")?.toString() ?? "";
		if (!id) return fail(400, { error: "ID is required" });

		const result = await regenerateToken(id);
		if (!result) return fail(404, { error: "Token not found" });
		return { regenerated: { ...result.token, token: result.plainToken } };
	},
} satisfies Actions;
