import { randomBytes } from "node:crypto";
import { createToken } from "$lib/server/services/tokens";
import { createTarget } from "$lib/server/services/targets";
import { createAuthMethod } from "$lib/server/services/auth-methods";
import { addPermission } from "$lib/server/services/permissions";
import { db } from "$lib/server/db";
import { tokens, targets, targetAuthMethods, tokenPermissions, users, webhookEndpoints, webhookEvents } from "$lib/server/db/schema";

function uid() {
	return randomBytes(4).toString("hex");
}

export async function createTestToken(name?: string) {
	return createToken(name ?? `Agent ${uid()}`);
}

export async function createTestTarget(name?: string, baseUrl = "https://api.example.com") {
	return createTarget({ name: name ?? `API ${uid()}`, type: "api", base_url: baseUrl });
}

export async function createTestAuthMethod(
	targetId: string,
	opts: { label?: string; type?: string; credential?: string; isDefault?: boolean } = {},
) {
	return createAuthMethod(targetId, {
		label: opts.label ?? "Test Key",
		type: opts.type ?? "bearer",
		credential: opts.credential ?? "sk-test-credential-12345678",
		isDefault: opts.isDefault ?? true,
	});
}

export async function grantPermission(tokenId: string, targetId: string) {
	return addPermission(tokenId, targetId);
}

export async function createTestWebhookEndpoint(
	tokenId: string,
	opts: { name?: string; secret?: string; signatureHeader?: string } = {},
) {
	const { createEndpoint } = await import("$lib/server/services/webhook-endpoints");
	return createEndpoint(tokenId, {
		name: opts.name ?? `Webhook ${uid()}`,
		secret: opts.secret,
		signatureHeader: opts.signatureHeader,
	});
}

export async function truncateAll() {
	await db.delete(webhookEvents);
	await db.delete(webhookEndpoints);
	await db.delete(tokenPermissions);
	await db.delete(targetAuthMethods);
	await db.delete(tokens);
	await db.delete(targets);
	await db.delete(users);
}
