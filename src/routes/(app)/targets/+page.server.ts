import { fail } from "@sveltejs/kit";
import { listTargets, createTarget, updateTarget, deleteTarget, getTargetBySlug } from "$lib/server/services/targets";
import { createAuthMethod } from "$lib/server/services/auth-methods";
import { listTokens } from "$lib/server/services/tokens";
import { addPermission } from "$lib/server/services/permissions";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async () => {
	try {
		const [targets, allTokens] = await Promise.all([listTargets(), listTokens()]);
		const activeTokens = allTokens.filter((t) => !t.revokedAt);
		return {
			targets: targets.map((t) => ({ ...t, enabled: t.enabled !== false })),
			activeTokens: activeTokens.map((t) => ({ id: t.id, name: t.name })),
		};
	} catch {
		return { targets: [], activeTokens: [] };
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
		const type = data.get("type")?.toString() ?? "bearer";
		const isDefault = data.get("isDefault") === "on";
		if (!label) return fail(400, { error: "Label is required" });

		let credential: string;
		if (type === "basic") {
			const username = data.get("credential1")?.toString() ?? "";
			const password = data.get("credential2")?.toString() ?? "";
			if (!username || !password) return fail(400, { error: "Username and password are required" });
			credential = `${username}:${password}`;
		} else if (type === "custom_header") {
			const headerName = data.get("credential1")?.toString() ?? "";
			const headerValue = data.get("credential2")?.toString() ?? "";
			if (!headerName || !headerValue) return fail(400, { error: "Header name and value are required" });
			credential = `${headerName}: ${headerValue}`;
		} else {
			credential = data.get("credential")?.toString() ?? "";
			if (!credential) return fail(400, { error: "Credential is required" });
		}

		const target = await getTargetBySlug(slug);
		if (!target) return fail(404, { error: "Target not found" });

		try {
			const authMethod = await createAuthMethod(target.id, {
				label,
				type,
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

	grantAccess: async ({ request }) => {
		const data = await request.formData();
		const targetId = data.get("targetId")?.toString() ?? "";
		const tokenIds = data.getAll("tokenIds").map((v) => v.toString()).filter(Boolean);
		if (!targetId) return fail(400, { error: "Target ID is required" });

		let granted = 0;
		for (const tokenId of tokenIds) {
			try {
				await addPermission(tokenId, targetId);
				granted++;
			} catch {
				// skip duplicates
			}
		}
		return { accessGranted: { targetId, granted } };
	},
} satisfies Actions;
