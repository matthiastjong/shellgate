import { fail } from "@sveltejs/kit";
import { listTargets, createTarget, updateTarget, deleteTarget, getTargetBySlug } from "$lib/server/services/targets";
import { createAuthMethod } from "$lib/server/services/auth-methods";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async () => {
	try {
		const targets = await listTargets();
		return { targets: targets.map((t) => ({ ...t, enabled: t.enabled !== false })) };
	} catch {
		return { targets: [] };
	}
};

export const actions = {
	create: async ({ request }) => {
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
			return fail(400, { error: err instanceof Error ? err.message : "Failed to add auth method" });
		}
	},

	toggle: async ({ request }) => {
		const data = await request.formData();
		const id = data.get("id")?.toString() ?? "";
		const enabled = data.get("enabled") === "true";

		try {
			const result = await updateTarget(id, { enabled });
			if (!result) return fail(404, { error: "Target not found" });
			return { toggled: { id, enabled } };
		} catch (err) {
			return fail(500, { error: err instanceof Error ? err.message : "Failed to toggle target" });
		}
	},

	delete: async ({ request }) => {
		const data = await request.formData();
		const id = data.get("id")?.toString() ?? "";

		try {
			const result = await deleteTarget(id);
			if (!result) return fail(404, { error: "Target not found" });
			return { deleted: id };
		} catch (err) {
			return fail(500, { error: err instanceof Error ? err.message : "Failed to delete target" });
		}
	},
} satisfies Actions;
