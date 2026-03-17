import { error, fail } from "@sveltejs/kit";
import { getTokenById, renameToken } from "$lib/server/services/tokens";
import { listTargets } from "$lib/server/services/targets";
import { listPermissions, addPermission, removePermission } from "$lib/server/services/permissions";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params }) => {
	const token = await getTokenById(params.id);
	if (!token) throw error(404, "API key not found");

	const [allTargets, permissions] = await Promise.all([
		listTargets(),
		listPermissions(params.id),
	]);

	return { token, targets: allTargets, permissions };
};

export const actions = {
	grant: async ({ request, params }) => {
		const token = await getTokenById(params.id);
		if (!token) return fail(404, { error: "API key not found" });

		const data = await request.formData();
		const targetId = data.get("targetId")?.toString() ?? "";
		if (!targetId) return fail(400, { error: "Target ID is required" });

		try {
			await addPermission(token.id, targetId);
			return { granted: targetId };
		} catch (err) {
			return fail(400, { error: err instanceof Error ? err.message : "Failed to grant access" });
		}
	},

	revoke: async ({ request, params }) => {
		const token = await getTokenById(params.id);
		if (!token) return fail(404, { error: "API key not found" });

		const data = await request.formData();
		const targetId = data.get("targetId")?.toString() ?? "";
		if (!targetId) return fail(400, { error: "Target ID is required" });

		const result = await removePermission(token.id, targetId);
		if (!result) return fail(404, { error: "Permission not found" });
		return { revoked: targetId };
	},

	rename: async ({ request, params }) => {
		const data = await request.formData();
		const name = data.get("name")?.toString()?.trim() ?? "";
		if (!name) return fail(400, { error: "Name is required" });
		if (name.length > 255) return fail(400, { error: "Name must be 255 characters or less" });

		const result = await renameToken(params.id, name);
		if (!result) return fail(404, { error: "API key not found" });
		return { renamed: { id: params.id, name } };
	},
} satisfies Actions;
