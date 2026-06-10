import { error, fail } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import { db } from "$lib/server/db";
import { tokenPermissions, tokens } from "$lib/server/db/schema";
import { getTargetBySlug, updateTarget } from "$lib/server/services/targets";
import { getAccountById } from "$lib/server/services/connected-accounts";
import { listAuthMethods, createAuthMethod, updateAuthMethod, deleteAuthMethod, getAuthMethodCredential, getDefaultAuthMethod } from "$lib/server/services/auth-methods";
import { listTokens } from "$lib/server/services/tokens";
import { addPermission } from "$lib/server/services/permissions";
import { testConnection as mailTestConnection } from "$lib/server/services/mail";
import type { EmailConfig } from "$lib/server/db/schema";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params }) => {
	const target = await getTargetBySlug(params.slug);
	if (!target) throw error(404, "Target not found");

	const connectedAccount = target.connectedAccountId
		? await getAccountById(target.connectedAccountId)
		: null;

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
		connectedAccount,
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

	updateConnection: async ({ request }) => {
		const data = await request.formData();
		const id = data.get("id")?.toString() ?? "";
		const host = data.get("host")?.toString()?.trim() ?? "";
		const port = parseInt(data.get("port")?.toString() ?? "22", 10) || 22;
		const username = data.get("username")?.toString()?.trim() ?? "";
		if (!host) return fail(400, { error: "Host is required" });
		if (!username) return fail(400, { error: "Username is required" });

		try {
			const updated = await updateTarget(id, { config: { host, port, username } });
			if (!updated) return fail(404, { error: "Target not found" });
			return { updatedConnection: { id: updated.id, config: updated.config } };
		} catch (err) {
			return fail(400, { error: err instanceof Error ? err.message : "Failed to update connection" });
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
			const headerNames = data.getAll("headerName").map((v) => v.toString().trim());
			const headerValues = data.getAll("headerValue").map((v) => v.toString());
			const headers = headerNames
				.map((name, i) => ({ name, value: headerValues[i] ?? "" }))
				.filter((h) => h.name && h.value);
			if (headers.length === 0) return fail(400, { error: "At least one header name and value is required" });
			credential = JSON.stringify(headers);
		} else if (type === "query_param") {
			const paramName = data.get("credential1")?.toString() ?? "";
			const paramValue = data.get("credential2")?.toString() ?? "";
			if (!paramName || !paramValue) return fail(400, { error: "Parameter name and value are required" });
			credential = `${paramName}:${paramValue}`;
		} else if (type === "jwt_es256") {
			const privateKey = data.get("jwtPrivateKey")?.toString() ?? "";
			const keyId = data.get("jwtKeyId")?.toString()?.trim() ?? "";
			const issuerId = data.get("jwtIssuerId")?.toString()?.trim() ?? "";
			if (!privateKey || !keyId || !issuerId) return fail(400, { error: "Private key, Key ID, and Issuer ID are required" });

			const config: Record<string, unknown> = { privateKey, keyId, issuerId };
			const audience = data.get("jwtAudience")?.toString()?.trim();
			if (audience) config.audience = audience;
			const expiresIn = data.get("jwtExpiresIn")?.toString()?.trim();
			if (expiresIn) config.expiresInSeconds = parseInt(expiresIn, 10);

			credential = JSON.stringify(config);
		} else if (type === "oauth2_refresh_token") {
			const clientId = data.get("oauth2ClientId")?.toString()?.trim() ?? "";
			const clientSecret = data.get("oauth2ClientSecret")?.toString()?.trim() ?? "";
			const refreshToken = data.get("oauth2RefreshToken")?.toString()?.trim() ?? "";
			if (!clientId || !clientSecret || !refreshToken) return fail(400, { error: "Client ID, Client Secret, and Refresh Token are required" });

			const config: Record<string, unknown> = { clientId, clientSecret, refreshToken };
			const tokenUrl = data.get("oauth2TokenUrl")?.toString()?.trim();
			if (tokenUrl) config.tokenUrl = tokenUrl;

			credential = JSON.stringify(config);
		} else if (type === "json_body") {
			credential = data.get("credential")?.toString() ?? "";
			if (!credential) return fail(400, { error: "JSON body is required" });
			try {
				const parsed = JSON.parse(credential);
				if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
					return fail(400, { error: "JSON body must be a JSON object" });
				}
			} catch {
				return fail(400, { error: "Invalid JSON" });
			}
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

	editAuthMethod: async ({ request }) => {
		const data = await request.formData();
		const slug = data.get("slug")?.toString() ?? "";
		const id = data.get("id")?.toString() ?? "";
		const label = data.get("label")?.toString()?.trim() ?? "";
		const type = data.get("type")?.toString() ?? "";
		const isDefault = data.get("isDefault") === "on";

		if (!label) return fail(400, { error: "Label is required" });
		if (!type) return fail(400, { error: "Type is required" });

		let credential: string | undefined;
		if (type === "basic") {
			const username = data.get("credential1")?.toString() ?? "";
			const password = data.get("credential2")?.toString() ?? "";
			if (username || password) {
				if (!username || !password) return fail(400, { error: "Username and password are required" });
				credential = `${username}:${password}`;
			}
		} else if (type === "custom_header") {
			const headerNames = data.getAll("headerName").map((v) => v.toString().trim());
			const headerValues = data.getAll("headerValue").map((v) => v.toString());
			const headers = headerNames
				.map((name, i) => ({ name, value: headerValues[i] ?? "" }))
				.filter((h) => h.name && h.value);
			if (headers.length > 0) {
				credential = JSON.stringify(headers);
			}
		} else if (type === "query_param") {
			const paramName = data.get("credential1")?.toString() ?? "";
			const paramValue = data.get("credential2")?.toString() ?? "";
			if (paramName || paramValue) {
				if (!paramName || !paramValue) return fail(400, { error: "Parameter name and value are required" });
				credential = `${paramName}:${paramValue}`;
			}
		} else if (type === "jwt_es256") {
			const privateKey = data.get("jwtPrivateKey")?.toString() ?? "";
			const keyId = data.get("jwtKeyId")?.toString()?.trim() ?? "";
			const issuerId = data.get("jwtIssuerId")?.toString()?.trim() ?? "";
			if (privateKey || keyId || issuerId) {
				if (!privateKey || !keyId || !issuerId) return fail(400, { error: "All JWT fields are required when updating" });
				const config: Record<string, unknown> = { privateKey, keyId, issuerId };
				const audience = data.get("jwtAudience")?.toString()?.trim();
				if (audience) config.audience = audience;
				const expiresIn = data.get("jwtExpiresIn")?.toString()?.trim();
				if (expiresIn) config.expiresInSeconds = parseInt(expiresIn, 10);
				credential = JSON.stringify(config);
			}
		} else if (type === "oauth2_refresh_token") {
			const clientId = data.get("oauth2ClientId")?.toString()?.trim() ?? "";
			const clientSecret = data.get("oauth2ClientSecret")?.toString()?.trim() ?? "";
			const refreshToken = data.get("oauth2RefreshToken")?.toString()?.trim() ?? "";
			if (clientId || clientSecret || refreshToken) {
				if (!clientId || !clientSecret || !refreshToken) return fail(400, { error: "All OAuth2 fields are required when updating" });
				const config: Record<string, unknown> = { clientId, clientSecret, refreshToken };
				const tokenUrl = data.get("oauth2TokenUrl")?.toString()?.trim();
				if (tokenUrl) config.tokenUrl = tokenUrl;
				credential = JSON.stringify(config);
			}
		} else if (type === "json_body") {
			const raw = data.get("credential")?.toString() ?? "";
			if (raw) {
				try {
					const parsed = JSON.parse(raw);
					if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
						return fail(400, { error: "JSON body must be a JSON object" });
					}
					credential = raw;
				} catch {
					return fail(400, { error: "Invalid JSON" });
				}
			}
		} else {
			const raw = data.get("credential")?.toString() ?? "";
			if (raw) credential = raw;
		}

		const target = await getTargetBySlug(slug);
		if (!target) return fail(404, { error: "Target not found" });

		const result = await updateAuthMethod(target.id, id, { label, type, credential, isDefault: isDefault || undefined });
		if (!result) return fail(404, { error: "Auth method not found" });
		return { authMethodEdited: { id, label, type: result.type, credentialHint: result.credentialHint, isDefault: result.isDefault } };
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

	updateEmailConfig: async ({ request }) => {
		const data = await request.formData();
		const id = data.get("id")?.toString() ?? "";
		const email = data.get("email")?.toString()?.trim() ?? "";
		const imap_host = data.get("imap_host")?.toString()?.trim() ?? "";
		const imap_port = parseInt(data.get("imap_port")?.toString() ?? "993", 10) || 993;
		const imap_secure = data.get("imap_secure") === "on";
		const smtp_host = data.get("smtp_host")?.toString()?.trim() ?? "";
		const smtp_port = parseInt(data.get("smtp_port")?.toString() ?? "587", 10) || 587;
		const smtp_secure = data.get("smtp_secure") === "on";

		if (!email) return fail(400, { error: "Email address is required" });
		if (!imap_host) return fail(400, { error: "IMAP host is required" });
		if (!smtp_host) return fail(400, { error: "SMTP host is required" });

		try {
			const updated = await updateTarget(id, {
				email,
				config: {
					imap: { host: imap_host, port: imap_port, secure: imap_secure },
					smtp: { host: smtp_host, port: smtp_port, secure: smtp_secure },
				},
			});
			if (!updated) return fail(404, { error: "Target not found" });
			return { updated: true, emailConfig: { email: updated.email, config: updated.config } };
		} catch (err) {
			return fail(400, { error: err instanceof Error ? err.message : "Failed to update email config" });
		}
	},

	testConnection: async ({ params }) => {
		const target = await getTargetBySlug(params.slug);
		if (!target) return fail(404, { error: "Target not found" });
		if (target.type !== "email") return fail(400, { error: "Target is not an email target" });

		const config = target.config as EmailConfig | null;
		if (!config) return fail(400, { error: "Email config not set" });

		const defaultAuth = await getDefaultAuthMethod(target.id);
		if (!defaultAuth) return fail(400, { error: "No default auth method set — add credentials first" });

		const credentialResult = await getAuthMethodCredential(target.id, defaultAuth.id);
		if (!credentialResult) return fail(400, { error: "Could not retrieve credentials" });

		try {
			const testResult = await mailTestConnection(config, credentialResult.credential);
			return { testResult };
		} catch (err) {
			return { testResult: { imap: false, smtp: false, error: err instanceof Error ? err.message : String(err) } };
		}
	},
} satisfies Actions;
