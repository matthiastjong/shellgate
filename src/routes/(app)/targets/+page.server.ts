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
		const type = (data.get("type")?.toString() ?? "api") as "api" | "ssh";
		if (!name) return fail(400, { error: "Name is required" });

		if (type === "ssh") {
			const host = data.get("host")?.toString()?.trim() ?? "";
			const port = parseInt(data.get("port")?.toString() ?? "22", 10) || 22;
			const username = data.get("username")?.toString()?.trim() ?? "";
			if (!host) return fail(400, { error: "Host is required" });
			if (!username) return fail(400, { error: "Username is required" });
			try {
				const target = await createTarget({ name, type: "ssh", config: { host, port, username } });
				return { created: { ...target, enabled: target.enabled !== false } };
			} catch (err) {
				return fail(400, { error: err instanceof Error ? err.message : "Failed to create target" });
			}
		} else {
			const base_url = data.get("base_url")?.toString()?.trim() ?? "";
			if (!base_url) return fail(400, { error: "Base URL is required" });
			try {
				const target = await createTarget({ name, type: "api", base_url });
				return { created: { ...target, enabled: target.enabled !== false } };
			} catch (err) {
				return fail(400, { error: err instanceof Error ? err.message : "Failed to create target" });
			}
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
		} else if (type === "query_param") {
			const paramName = data.get("credential1")?.toString() ?? "";
			const paramValue = data.get("credential2")?.toString() ?? "";
			if (!paramName || !paramValue) return fail(400, { error: "Parameter name and value are required" });
			credential = `${paramName}:${paramValue}`;
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

	grantAccess: async ({ request }) => {
		const data = await request.formData();
		const targetId = data.get("targetId")?.toString() ?? "";
		const tokenIds = data.getAll("tokenIds").map((v) => v.toString());
		if (!targetId) return fail(400, { error: "Target ID is required" });

		try {
			for (const tokenId of tokenIds) {
				await addPermission(tokenId, targetId);
			}
			return { accessGranted: true };
		} catch (err) {
			return fail(400, { error: err instanceof Error ? err.message : "Failed to grant access" });
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
