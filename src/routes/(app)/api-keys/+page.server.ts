import { fail } from "@sveltejs/kit";
import { listTokens, createToken, renameToken, revokeToken, regenerateToken } from "$lib/server/services/tokens";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async () => {
	try {
		const tokens = await listTokens();
		return { tokens };
	} catch {
		return { tokens: [] };
	}
};

export const actions = {
	create: async ({ request }) => {
		const data = await request.formData();
		const name = data.get("name")?.toString()?.trim() ?? "";
		if (!name) return fail(400, { error: "Name is required" });
		if (name.length > 255) return fail(400, { error: "Name must be 255 characters or less" });

		const result = await createToken(name);
		return { created: { ...result.token, token: result.plainToken } };
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
