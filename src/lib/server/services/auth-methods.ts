import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { targetAuthMethods } from "../db/schema";

const VALID_TYPES = ["bearer", "basic", "custom_header", "query_param", "ssh_key", "jwt_es256", "oauth2_refresh_token"];

export function computeCredentialHint(credential: string, type?: string): string {
	if (type === "custom_header") {
		// Try JSON array format: [{"name":"X-Key","value":"val"}, ...]
		try {
			const parsed = JSON.parse(credential);
			if (Array.isArray(parsed) && parsed.length > 0) {
				const names = parsed
					.filter((e: unknown) => e && typeof (e as Record<string, unknown>).name === "string")
					.map((e: { name: string }) => e.name);
				if (names.length === 1) return `Header: ${names[0]}`;
				if (names.length > 1) return `${names.length} headers: ${names.join(", ")}`;
			}
		} catch { /* legacy format — fall through */ }
	}
	if (type === "ssh_key") {
		if (credential.includes("RSA")) return "SSH Key (RSA)";
		if (credential.includes("ED25519")) return "SSH Key (Ed25519)";
		if (credential.includes("ECDSA")) return "SSH Key (ECDSA)";
		return "SSH Private Key";
	}
	if (type === "jwt_es256") {
		try {
			const config = JSON.parse(credential);
			if (config.keyId) return `ES256 JWT ••• ${config.keyId}`;
			return "ES256 JWT";
		} catch {
			return "ES256 JWT (invalid config)";
		}
	}
	if (type === "oauth2_refresh_token") {
		try {
			const config = JSON.parse(credential);
			if (config.clientId) return `OAuth2 ••• ${config.clientId.slice(0, 8)}`;
			return "OAuth2 Refresh Token";
		} catch {
			return "OAuth2 (invalid config)";
		}
	}
	if (credential.length < 10) return "••••••••";
	return `${credential.slice(0, 3)}••••••••${credential.slice(-4)}`;
}

export async function listAuthMethods(targetId: string) {
	return db
		.select({
			id: targetAuthMethods.id,
			targetId: targetAuthMethods.targetId,
			label: targetAuthMethods.label,
			type: targetAuthMethods.type,
			credentialHint: targetAuthMethods.credentialHint,
			isDefault: targetAuthMethods.isDefault,
			createdAt: targetAuthMethods.createdAt,
			updatedAt: targetAuthMethods.updatedAt,
		})
		.from(targetAuthMethods)
		.where(eq(targetAuthMethods.targetId, targetId));
}

export async function createAuthMethod(
	targetId: string,
	data: {
		label: string;
		type: string;
		credential: string;
		isDefault?: boolean;
	},
) {
	const label = data.label.trim();
	if (!label) throw new Error("label is required");
	if (label.length > 255) throw new Error("label must be 255 characters or less");

	if (!VALID_TYPES.includes(data.type)) {
		throw new Error(`type must be one of: ${VALID_TYPES.join(", ")}`);
	}

	if (!data.credential) throw new Error("credential is required");

	const isDefault = data.isDefault === true;

	const [row] = await db.transaction(async (tx) => {
		if (isDefault) {
			await tx
				.update(targetAuthMethods)
				.set({ isDefault: false, updatedAt: new Date() })
				.where(
					and(
						eq(targetAuthMethods.targetId, targetId),
						eq(targetAuthMethods.isDefault, true),
					),
				);
		}

		return tx
			.insert(targetAuthMethods)
			.values({
				targetId,
				label,
				type: data.type,
				credential: data.credential,
				credentialHint: computeCredentialHint(data.credential, data.type),
				isDefault,
			})
			.returning({
				id: targetAuthMethods.id,
				targetId: targetAuthMethods.targetId,
				label: targetAuthMethods.label,
				type: targetAuthMethods.type,
				credential: targetAuthMethods.credential,
				credentialHint: targetAuthMethods.credentialHint,
				isDefault: targetAuthMethods.isDefault,
				createdAt: targetAuthMethods.createdAt,
				updatedAt: targetAuthMethods.updatedAt,
			});
	});

	return row;
}

export async function updateAuthMethod(
	targetId: string,
	id: string,
	data: {
		label?: string;
		type?: string;
		credential?: string;
		isDefault?: boolean;
	},
) {
	const [existing] = await db
		.select({ id: targetAuthMethods.id })
		.from(targetAuthMethods)
		.where(
			and(
				eq(targetAuthMethods.id, id),
				eq(targetAuthMethods.targetId, targetId),
			),
		)
		.limit(1);

	if (!existing) return null;

	const updates: Record<string, unknown> = { updatedAt: new Date() };

	if (data.label !== undefined) {
		const label = data.label.trim();
		if (!label) throw new Error("label is required");
		if (label.length > 255) throw new Error("label must be 255 characters or less");
		updates.label = label;
	}

	if (data.type !== undefined) {
		if (!VALID_TYPES.includes(data.type)) throw new Error(`type must be one of: ${VALID_TYPES.join(", ")}`);
		updates.type = data.type;
	}

	if (data.credential !== undefined) {
		if (!data.credential) throw new Error("credential is required");
		updates.credential = data.credential;
		updates.credentialHint = computeCredentialHint(data.credential, data.type);
	}

	if (data.isDefault !== undefined) {
		updates.isDefault = data.isDefault === true;
	}

	const [row] = await db.transaction(async (tx) => {
		if (updates.isDefault === true) {
			await tx
				.update(targetAuthMethods)
				.set({ isDefault: false, updatedAt: new Date() })
				.where(
					and(
						eq(targetAuthMethods.targetId, targetId),
						eq(targetAuthMethods.isDefault, true),
					),
				);
		}

		return tx
			.update(targetAuthMethods)
			.set(updates)
			.where(eq(targetAuthMethods.id, id))
			.returning({
				id: targetAuthMethods.id,
				targetId: targetAuthMethods.targetId,
				label: targetAuthMethods.label,
				type: targetAuthMethods.type,
				credentialHint: targetAuthMethods.credentialHint,
				isDefault: targetAuthMethods.isDefault,
				createdAt: targetAuthMethods.createdAt,
				updatedAt: targetAuthMethods.updatedAt,
			});
	});

	return row;
}

export async function deleteAuthMethod(targetId: string, id: string) {
	const [existing] = await db
		.select({ id: targetAuthMethods.id })
		.from(targetAuthMethods)
		.where(
			and(
				eq(targetAuthMethods.id, id),
				eq(targetAuthMethods.targetId, targetId),
			),
		)
		.limit(1);

	if (!existing) return null;

	await db.delete(targetAuthMethods).where(eq(targetAuthMethods.id, id));

	return { id, deleted: true };
}

export async function getAuthMethodCredential(targetId: string, id: string) {
	const [row] = await db
		.select({ id: targetAuthMethods.id, credential: targetAuthMethods.credential })
		.from(targetAuthMethods)
		.where(
			and(
				eq(targetAuthMethods.id, id),
				eq(targetAuthMethods.targetId, targetId),
			),
		)
		.limit(1);

	return row ?? null;
}

export async function getDefaultAuthMethod(targetId: string) {
	const [row] = await db
		.select()
		.from(targetAuthMethods)
		.where(
			and(
				eq(targetAuthMethods.targetId, targetId),
				eq(targetAuthMethods.isDefault, true),
			),
		)
		.limit(1);

	return row ?? null;
}
