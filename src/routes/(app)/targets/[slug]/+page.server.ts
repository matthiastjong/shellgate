import { error, fail } from "@sveltejs/kit";
import { getTargetBySlug, updateTarget } from "$lib/server/services/targets";
import { listAuthMethods, createAuthMethod, updateAuthMethod, deleteAuthMethod } from "$lib/server/services/auth-methods";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params }) => {
	const target = await getTargetBySlug(params.slug);
	if (!target) throw error(404, "Target not found");

	let authMethods;
	try {
		authMethods = await listAuthMethods(target.id);
	} catch {
		authMethods = [];
	}

	return {
		target: { ...target, enabled: target.enabled !== false },
		authMethods,
	};
};

export const actions = {
	rename: async ({ request }) => {
		const data = await request.formData();
		const id = data.get("id")?.toString() ?? "";
		const name = data.get("name")?.toString()?.trim() ?? "";
		if (!name) return fail(400, { error: "Name is required" });

		try {
			const updated = await updateTarget(id, { name });
			if (!updated) return fail(404, { error: "Target not found" });
			return { renamed: { id: updated.id, name: updated.name, slug: updated.slug } };
		} catch (err) {
			return fail(400, { error: err instanceof Error ? err.message : "Failed to rename target" });
		}
	},

	updateBaseUrl: async ({ request }) => {
		const data = await request.formData();
		const id = data.get("id")?.toString() ?? "";
		const base_url = data.get("base_url")?.toString()?.trim() ?? "";
		if (!base_url) return fail(400, { error: "Base URL is required" });

		try {
			const updated = await updateTarget(id, { base_url });
			if (!updated) return fail(404, { error: "Target not found" });
			return { updatedBaseUrl: { id: updated.id, baseUrl: updated.baseUrl } };
		} catch (err) {
			return fail(400, { error: err instanceof Error ? err.message : "Failed to update base URL" });
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

	renameAuthMethod: async ({ request }) => {
		const data = await request.formData();
		const slug = data.get("slug")?.toString() ?? "";
		const id = data.get("id")?.toString() ?? "";
		const label = data.get("label")?.toString()?.trim() ?? "";
		if (!label) return fail(400, { error: "Label is required" });

		const target = await getTargetBySlug(slug);
		if (!target) return fail(404, { error: "Target not found" });

		const result = await updateAuthMethod(target.id, id, { label });
		if (!result) return fail(404, { error: "Auth method not found" });
		return { authMethodRenamed: { id, label } };
	},

	setDefault: async ({ request }) => {
		const data = await request.formData();
		const slug = data.get("slug")?.toString() ?? "";
		const id = data.get("id")?.toString() ?? "";

		const target = await getTargetBySlug(slug);
		if (!target) return fail(404, { error: "Target not found" });

		const result = await updateAuthMethod(target.id, id, { isDefault: true });
		if (!result) return fail(404, { error: "Auth method not found" });
		return { defaultSet: id };
	},

	updateCredential: async ({ request }) => {
		const data = await request.formData();
		const slug = data.get("slug")?.toString() ?? "";
		const id = data.get("id")?.toString() ?? "";
		const credential = data.get("credential")?.toString() ?? "";
		if (!credential) return fail(400, { error: "Credential is required" });

		const target = await getTargetBySlug(slug);
		if (!target) return fail(404, { error: "Target not found" });

		const result = await updateAuthMethod(target.id, id, { credential });
		if (!result) return fail(404, { error: "Auth method not found" });
		return { credentialUpdated: { id, credentialHint: result.credentialHint } };
	},

	deleteAuthMethod: async ({ request }) => {
		const data = await request.formData();
		const slug = data.get("slug")?.toString() ?? "";
		const id = data.get("id")?.toString() ?? "";

		const target = await getTargetBySlug(slug);
		if (!target) return fail(404, { error: "Target not found" });

		const result = await deleteAuthMethod(target.id, id);
		if (!result) return fail(404, { error: "Auth method not found" });
		return { authMethodDeleted: id };
	},
} satisfies Actions;
