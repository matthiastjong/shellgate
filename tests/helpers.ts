import { randomBytes } from "node:crypto";
import { createToken } from "$lib/server/services/tokens";
import { createTarget } from "$lib/server/services/targets";
import { createAuthMethod } from "$lib/server/services/auth-methods";
import { addPermission } from "$lib/server/services/permissions";
import { db } from "$lib/server/db";
import { tokens, targets, targetAuthMethods, tokenPermissions, users, webhookEndpoints, webhookEvents, skills, memories, wikiPages, vaults, vaultItems, vaultItemFields, tokenVaultPermissions, connectedAccounts } from "$lib/server/db/schema";

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

export async function createTestVault(name?: string) {
	const { createVault } = await import("$lib/server/services/vaults");
	return createVault({ name: name ?? `Vault ${uid()}` });
}

export async function createTestVaultItem(
	vaultId: string,
	opts: { name?: string; domain?: string; fields?: Array<{ name: string; value: string; sensitive?: boolean }> } = {},
) {
	const { createItem } = await import("$lib/server/services/vault-items");
	return createItem(vaultId, {
		name: opts.name ?? `Item ${uid()}`,
		domain: opts.domain,
		fields: opts.fields ?? [],
	});
}

export async function grantVaultPermission(tokenId: string, vaultId: string) {
	const { addVaultPermission } = await import("$lib/server/services/vault-permissions");
	return addVaultPermission(tokenId, vaultId);
}

export async function createTestMemory(
	tokenId: string,
	overrides: {
		summary?: string;
		content?: string;
		visibility?: string;
		userIdentifier?: string;
	} = {},
) {
	const { addMemory } = await import("$lib/server/services/memories");
	return addMemory({
		tokenId,
		summary: overrides.summary ?? "Test memory",
		content: overrides.content ?? "Test memory content",
		visibility: (overrides.visibility ?? "org") as "org" | "user" | "token",
		userIdentifier: overrides.userIdentifier ?? null,
		metadata: {},
	});
}

export async function createTestWikiPage(
	overrides: {
		namespace?: string;
		slug?: string;
		title?: string;
		summary?: string;
		body?: string;
	} = {},
) {
	const { upsertWikiPage } = await import("$lib/server/services/wiki");
	return upsertWikiPage({
		namespace: overrides.namespace ?? "general",
		slug: overrides.slug ?? "test-page",
		title: overrides.title ?? "Test Page",
		summary: overrides.summary ?? "A test wiki page",
		body: overrides.body ?? "Test wiki page body content.",
		tags: [],
		sources: [],
		updatedBy: "test",
	});
}

export async function truncateAll() {
	await db.delete(connectedAccounts);
	await db.delete(wikiPages);
	await db.delete(memories);
	await db.delete(skills);
	await db.delete(webhookEvents);
	await db.delete(webhookEndpoints);
	await db.delete(vaultItemFields);
	await db.delete(vaultItems);
	await db.delete(tokenVaultPermissions);
	await db.delete(vaults);
	await db.delete(tokenPermissions);
	await db.delete(targetAuthMethods);
	await db.delete(tokens);
	await db.delete(targets);
	await db.delete(users);
}
