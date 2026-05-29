import { describe, it, expect, beforeEach } from "vitest";
import { truncateAll, createTestToken, createTestVault, createTestVaultItem, grantVaultPermission } from "../helpers";
import { getItem, getFieldValue } from "$lib/server/services/vault-items";
import { matchesOrigin } from "$lib/server/utils/origin-match";
import { db } from "$lib/server/db";
import { auditLogs } from "$lib/server/db/schema";
import { eq, desc } from "drizzle-orm";

describe("vault field value with origin validation", () => {
	beforeEach(async () => {
		process.env.VAULT_ENCRYPTION_KEY = Buffer.from("a]3Fq!9Lp@2Xw#7Yz&5Bv*8Cn$4Dm%6E").toString("base64");
		await truncateAll();
	});

	it("returns value when origin matches allowedOrigins", async () => {
		const { token } = await createTestToken();
		const vault = await createTestVault("Production");
		await grantVaultPermission(token.id, vault.id);
		await createTestVaultItem(vault.id, {
			name: "GitHub Login",
			domain: "github.com",
			fields: [{ name: "password", value: "secret123", sensitive: true }],
		});

		const item = await getItem(vault.id, "github-login");
		expect(item).not.toBeNull();
		expect(matchesOrigin("https://github.com", item!.allowedOrigins as string[])).toBe(true);

		const value = await getFieldValue(item!.id, "password");
		expect(value).toBe("secret123");
	});

	it("rejects when origin does not match allowedOrigins", async () => {
		const vault = await createTestVault("Production");
		await createTestVaultItem(vault.id, {
			name: "GitHub Login",
			domain: "github.com",
			fields: [{ name: "password", value: "secret123", sensitive: true }],
		});

		const item = await getItem(vault.id, "github-login");
		expect(matchesOrigin("https://evil.com", item!.allowedOrigins as string[])).toBe(false);
	});

	it("allows any origin when allowedOrigins is empty", async () => {
		const vault = await createTestVault("Production");
		await createTestVaultItem(vault.id, {
			name: "Open Item",
			fields: [{ name: "key", value: "val", sensitive: true }],
		});

		const item = await getItem(vault.id, "open-item");
		expect(matchesOrigin("https://anything.com", item!.allowedOrigins as string[] | null)).toBe(true);
	});

	it("logs vault access to audit_logs", async () => {
		const { token } = await createTestToken();
		const vault = await createTestVault("Production");
		await grantVaultPermission(token.id, vault.id);
		await createTestVaultItem(vault.id, {
			name: "GitHub Login",
			domain: "github.com",
			fields: [{ name: "password", value: "secret123", sensitive: true }],
		});

		const { logRequest } = await import("$lib/server/services/audit");
		logRequest({
			tokenId: token.id,
			tokenName: token.name,
			targetId: null,
			targetSlug: null,
			type: "vault",
			method: "GET",
			path: "production/github-login/password",
			statusCode: 200,
			clientIp: "127.0.0.1",
			durationMs: null,
		});

		await new Promise((r) => setTimeout(r, 100));

		const logs = await db.select().from(auditLogs).where(eq(auditLogs.type, "vault")).orderBy(desc(auditLogs.createdAt));
		expect(logs.length).toBeGreaterThanOrEqual(1);
		expect(logs[0].path).toBe("production/github-login/password");
		expect(logs[0].type).toBe("vault");
	});
});
