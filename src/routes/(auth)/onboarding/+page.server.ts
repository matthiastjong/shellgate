import { fail, redirect } from "@sveltejs/kit";
import { listTokens, createToken } from "$lib/server/services/tokens";
import { listTargets, createTarget, getTargetBySlug } from "$lib/server/services/targets";
import { addPermission } from "$lib/server/services/permissions";
import { createAuthMethod } from "$lib/server/services/auth-methods";
import { resetHasTokensCache } from "$lib/server/cache";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async () => {
	const tokens = await listTokens();
	if (tokens.length > 0) redirect(303, "/");
	const targets = await listTargets();
	return { targets };
};

export const actions = {
	createTarget: async ({ request }) => {
		const data = await request.formData();
		const name = data.get("name")?.toString()?.trim() ?? "";
		const base_url = data.get("base_url")?.toString()?.trim() ?? "";
		if (!name) return fail(400, { error: "Name is required" });
		if (!base_url) return fail(400, { error: "Base URL is required" });

		try {
			const target = await createTarget({ name, type: "api", base_url });
			return { created: { ...target, enabled: target.enabled !== false } };
		} catch (err) {
			return fail(400, { error: err instanceof Error ? err.message : "Failed to create target" });
		}
	},

	addAuthMethod: async ({ request }) => {
		const data = await request.formData();
		const slug = data.get("slug")?.toString() ?? "";
		const label = data.get("label")?.toString()?.trim() ?? "";
		const credential = data.get("credential")?.toString() ?? "";
		const isDefault = data.get("isDefault") === "on";
		if (!label) return fail(400, { error: "Label is required" });
		if (!credential) return fail(400, { error: "Credential is required" });

		const target = await getTargetBySlug(slug);
		if (!target) return fail(404, { error: "Target not found" });

		try {
			const authMethod = await createAuthMethod(target.id, {
				label,
				type: "bearer",
				credential,
				isDefault,
			});
			return { authMethodAdded: authMethod };
		} catch (err) {
			return fail(400, { error: err instanceof Error ? err.message : "Failed to add credential" });
		}
	},

	createKey: async ({ request }) => {
		const data = await request.formData();
		const name = data.get("name")?.toString()?.trim() ?? "";
		const targetIds = data.get("targetIds")?.toString()?.trim() ?? "";

		if (!name) return fail(400, { error: "Name is required" });

		const result = await createToken(name);

		if (targetIds) {
			for (const id of targetIds.split(",").filter(Boolean)) {
				try {
					await addPermission(result.token.id, id);
				} catch {}
			}
		}

		resetHasTokensCache();

		return {
			created: {
				id: result.token.id,
				name: result.token.name,
				plainToken: result.plainToken,
			},
		};
	},
} satisfies Actions;
