import { describe, it, expect, beforeEach } from "vitest";
import { truncateAll, createTestToken } from "../helpers";
import { createVault, listVaults, getVault, getVaultBySlug, updateVault, deleteVault } from "$lib/server/services/vaults";
import { createItem, getItem, listItems, updateItem, deleteItem, addField, updateField, deleteField, getFieldValue, searchItems } from "$lib/server/services/vault-items";
import { addVaultPermission, removeVaultPermission, listVaultPermissions, hasVaultPermission } from "$lib/server/services/vault-permissions";

describe("vaults service", () => {
	beforeEach(async () => { await truncateAll(); });

	it("creates a vault with auto-generated slug", async () => {
		const vault = await createVault({ name: "Production Credentials" });
		expect(vault.id).toBeDefined();
		expect(vault.name).toBe("Production Credentials");
		expect(vault.slug).toBe("production-credentials");
	});

	it("rejects duplicate slugs", async () => {
		await createVault({ name: "Test Vault" });
		await expect(createVault({ name: "Test Vault" })).rejects.toThrow("slug already exists");
	});

	it("lists all vaults", async () => {
		await createVault({ name: "Vault A" });
		await createVault({ name: "Vault B" });
		const list = await listVaults();
		expect(list).toHaveLength(2);
	});

	it("gets vault by ID", async () => {
		const created = await createVault({ name: "My Vault" });
		const found = await getVault(created.id);
		expect(found?.name).toBe("My Vault");
	});

	it("gets vault by slug", async () => {
		await createVault({ name: "My Vault" });
		const found = await getVaultBySlug("my-vault");
		expect(found?.name).toBe("My Vault");
	});

	it("returns null for non-existent vault", async () => {
		const found = await getVault("00000000-0000-0000-0000-000000000000");
		expect(found).toBeNull();
	});

	it("updates a vault", async () => {
		const vault = await createVault({ name: "Old Name" });
		const updated = await updateVault(vault.id, { name: "New Name", description: "desc" });
		expect(updated?.name).toBe("New Name");
		expect(updated?.description).toBe("desc");
	});

	it("deletes a vault", async () => {
		const vault = await createVault({ name: "To Delete" });
		await deleteVault(vault.id);
		const found = await getVault(vault.id);
		expect(found).toBeNull();
	});
});

describe("vault items service", () => {
	let vaultId: string;

	beforeEach(async () => {
		await truncateAll();
		process.env.VAULT_ENCRYPTION_KEY = Buffer.from("a]3Fq!9Lp@2Xw#7Yz&5Bv*8Cn$4Dm%6E").toString("base64");
		const vault = await createVault({ name: "Test Vault" });
		vaultId = vault.id;
	});

	it("creates an item with fields", async () => {
		const item = await createItem(vaultId, {
			name: "GitHub Login", domain: "github.com",
			fields: [
				{ name: "username", value: "matthias@test.com", sensitive: false },
				{ name: "password", value: "secret123", sensitive: true },
			],
		});
		expect(item.slug).toBe("github-login");
		expect(item.domain).toBe("github.com");
	});

	it("lists items for a vault", async () => {
		await createItem(vaultId, { name: "Item A", fields: [] });
		await createItem(vaultId, { name: "Item B", fields: [] });
		const list = await listItems(vaultId);
		expect(list).toHaveLength(2);
	});

	it("gets item with fields, non-sensitive values decrypted", async () => {
		await createItem(vaultId, {
			name: "Login",
			fields: [
				{ name: "username", value: "user@test.com", sensitive: false },
				{ name: "password", value: "secret", sensitive: true },
			],
		});
		const item = await getItem(vaultId, "login");
		expect(item).not.toBeNull();
		const usernameField = item!.fields.find(f => f.name === "username");
		const passwordField = item!.fields.find(f => f.name === "password");
		expect(usernameField?.value).toBe("user@test.com");
		expect(passwordField?.value).toBeUndefined();
		expect(passwordField?.sensitive).toBe(true);
	});

	it("retrieves a sensitive field value", async () => {
		await createItem(vaultId, {
			name: "Login",
			fields: [{ name: "password", value: "secret123", sensitive: true }],
		});
		const item = await getItem(vaultId, "login");
		const value = await getFieldValue(item!.id, "password");
		expect(value).toBe("secret123");
	});

	it("rejects duplicate item slugs within vault", async () => {
		await createItem(vaultId, { name: "Login", fields: [] });
		await expect(createItem(vaultId, { name: "Login", fields: [] })).rejects.toThrow("slug already exists");
	});

	it("auto-populates allowedOrigins from domain", async () => {
		const item = await createItem(vaultId, { name: "ING", domain: "ing.nl", fields: [] });
		expect(item.allowedOrigins).toContain("https://ing.nl");
		expect(item.allowedOrigins).toContain("https://*.ing.nl");
	});

	it("normalizes URL domains before deriving allowedOrigins", async () => {
		const item = await createItem(vaultId, {
			name: "Webgains",
			domain: "https://platform.webgains.io/path",
			fields: [],
		});

		expect(item.domain).toBe("platform.webgains.io");
		expect(item.allowedOrigins).toEqual([
			"https://platform.webgains.io",
			"https://*.platform.webgains.io",
		]);
	});

	it("updates allowedOrigins when domain changes", async () => {
		const item = await createItem(vaultId, { name: "Login", domain: "github.com", fields: [] });

		const updated = await updateItem(item.id, { domain: "https://platform.webgains.io/" });

		expect(updated?.domain).toBe("platform.webgains.io");
		expect(updated?.allowedOrigins).toEqual([
			"https://platform.webgains.io",
			"https://*.platform.webgains.io",
		]);
	});

	it("clears allowedOrigins when domain is cleared", async () => {
		const item = await createItem(vaultId, { name: "Login", domain: "github.com", fields: [] });

		const updated = await updateItem(item.id, { domain: null });

		expect(updated?.domain).toBeNull();
		expect(updated?.allowedOrigins).toBeNull();
	});

	it("preserves explicit allowedOrigins when domain changes", async () => {
		const item = await createItem(vaultId, { name: "Login", domain: "github.com", fields: [] });

		const updated = await updateItem(item.id, {
			domain: "webgains.io",
			allowedOrigins: ["https://login.webgains.io"],
		});

		expect(updated?.domain).toBe("webgains.io");
		expect(updated?.allowedOrigins).toEqual(["https://login.webgains.io"]);
	});

	it("deletes item and cascades to fields", async () => {
		const item = await createItem(vaultId, {
			name: "To Delete",
			fields: [{ name: "pass", value: "x", sensitive: true }],
		});
		await deleteItem(item.id);
		const found = await getItem(vaultId, "to-delete");
		expect(found).toBeNull();
	});
});

describe("vault search", () => {
	let vaultId: string;
	let tokenId: string;

	beforeEach(async () => {
		await truncateAll();
		process.env.VAULT_ENCRYPTION_KEY = Buffer.from("a]3Fq!9Lp@2Xw#7Yz&5Bv*8Cn$4Dm%6E").toString("base64");
		const vault = await createVault({ name: "Test Vault" });
		vaultId = vault.id;
		const { token: testToken } = await createTestToken();
		tokenId = testToken.id;
		await addVaultPermission(tokenId, vaultId);
	});

	it("searches by domain", async () => {
		await createItem(vaultId, { name: "GitHub", domain: "github.com", fields: [{ name: "username", value: "user", sensitive: false }] });
		await createItem(vaultId, { name: "ING", domain: "ing.nl", fields: [] });
		const results = await searchItems(tokenId, "github");
		expect(results).toHaveLength(1);
		expect(results[0].domain).toBe("github.com");
	});

	it("searches by name", async () => {
		await createItem(vaultId, { name: "My Production Login", fields: [] });
		const results = await searchItems(tokenId, "production");
		expect(results).toHaveLength(1);
	});

	it("only returns items from permitted vaults", async () => {
		const otherVault = await createVault({ name: "Other Vault" });
		await createItem(otherVault.id, { name: "Secret Item", domain: "secret.com", fields: [] });
		const results = await searchItems(tokenId, "secret");
		expect(results).toHaveLength(0);
	});

	it("includes non-sensitive field values in results", async () => {
		await createItem(vaultId, {
			name: "Login", domain: "example.com",
			fields: [
				{ name: "username", value: "user@test.com", sensitive: false },
				{ name: "password", value: "secret", sensitive: true },
			],
		});
		const results = await searchItems(tokenId, "example");
		expect(results[0].fields).toHaveLength(2);
		const username = results[0].fields.find((f: { name: string }) => f.name === "username");
		const password = results[0].fields.find((f: { name: string }) => f.name === "password");
		expect(username?.value).toBe("user@test.com");
		expect(password?.value).toBeUndefined();
	});
});

describe("vault permissions", () => {
	let tokenId: string;
	let vaultId: string;

	beforeEach(async () => {
		await truncateAll();
		const { token } = await createTestToken();
		tokenId = token.id;
		const vault = await createVault({ name: "Test Vault" });
		vaultId = vault.id;
	});

	it("grants permission", async () => {
		const perm = await addVaultPermission(tokenId, vaultId);
		expect(perm.tokenId).toBe(tokenId);
		expect(perm.vaultId).toBe(vaultId);
	});

	it("rejects duplicate permission", async () => {
		await addVaultPermission(tokenId, vaultId);
		await expect(addVaultPermission(tokenId, vaultId)).rejects.toThrow("permission already exists");
	});

	it("lists permissions with vault info", async () => {
		await addVaultPermission(tokenId, vaultId);
		const list = await listVaultPermissions(tokenId);
		expect(list).toHaveLength(1);
		expect(list[0].vault.name).toBe("Test Vault");
	});

	it("checks permission", async () => {
		expect(await hasVaultPermission(tokenId, vaultId)).toBe(false);
		await addVaultPermission(tokenId, vaultId);
		expect(await hasVaultPermission(tokenId, vaultId)).toBe(true);
	});

	it("removes permission", async () => {
		await addVaultPermission(tokenId, vaultId);
		const result = await removeVaultPermission(tokenId, vaultId);
		expect(result?.deleted).toBe(true);
		expect(await hasVaultPermission(tokenId, vaultId)).toBe(false);
	});

	it("returns null when removing non-existent permission", async () => {
		const result = await removeVaultPermission(tokenId, vaultId);
		expect(result).toBeNull();
	});
});
