import { error, fail } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import { db } from "$lib/server/db";
import { tokenPermissions, tokens } from "$lib/server/db/schema";
import { getTargetBySlug, updateTarget } from "$lib/server/services/targets";
import { listAuthMethods, createAuthMethod, updateAuthMethod, deleteAuthMethod, getAuthMethodCredential } from "$lib/server/services/auth-methods";
import { listTokens } from "$lib/server/services/tokens";
import { addPermission } from "$lib/server/services/permissions";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params }) => {
	const target = await getTargetBySlug(params.slug);
	if (!target) throw error(404, "Target not found");

	let authMethods: Awaited<ReturnType<typeof listAuthMethods>> = [];
	try {
		authMethods = await listAuthMethods(target.id);
	} catch {
		// fallback to empty array
	}

	let tokenAccess: { id: string; name: string; revokedAt: Date | null; lastUsedAt: Date | null }[] = [];
	try {
		tokenAccess = await db
			.select({
				id: tokens.id,
				name: tokens.name,
				revokedAt: tokens.revokedAt,
				lastUsedAt: tokens.lastUsedAt,
			})
			.from(tokenPermissions)
			.innerJoin(tokens, eq(tokenPermissions.tokenId, tokens.id))
			.where(eq(tokenPermissions.targetId, target.id));
	} catch {
		// fallback to empty array
	}

	let availableTokens: { id: string; name: string }[] = [];
	try {
		const allTokens = await listTokens();
		const grantedIds = new Set(tokenAccess.map((t) => t.id));
		availableTokens = allTokens
			.filter((t) => !t.revokedAt && !grantedIds.has(t.id))
			.map((t) => ({ id: t.id, name: t.name }));
	} catch {
		// fallback to empty array
	}

	return {
		target: { ...target, enabled: target.enabled !== false },
		authMethods,
		tokenAccess,
		availableTokens,
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

	grantAccess: async ({ request }) => {
		const data = await request.formData();
		const targetId = data.get("targetId")?.toString() ?? "";
		const tokenIds = data.getAll("tokenIds").map((v) => v.toString());
		if (!targetId) return fail(400, { error: "Target ID is required" });

		const granted: { id: string; name: string }[] = [];
		try {
			for (const tokenId of tokenIds) {
				await addPermission(tokenId, targetId);
				const tokenName = data.get(`tokenName_${tokenId}`)?.toString() ?? "";
				granted.push({ id: tokenId, name: tokenName });
			}
			return { accessGranted: granted };
		} catch (err) {
			return fail(400, { error: err instanceof Error ? err.message : "Failed to grant access" });
		}
	},

	revealCredential: async ({ request }) => {
		const data = await request.formData();
		const slug = data.get("slug")?.toString() ?? "";
		const id = data.get("id")?.toString() ?? "";

		const target = await getTargetBySlug(slug);
		if (!target) return fail(404, { error: "Target not found" });

		const result = await getAuthMethodCredential(target.id, id);
		if (!result) return fail(404, { error: "Auth method not found" });
		return { revealedCredential: { id, credential: result.credential } };
	},
} satisfies Actions;
