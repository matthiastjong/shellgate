# Vault & Blind-Fill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add encrypted vault storage to Shellgate with a `vault_search` MCP tool, admin UI (password-manager style), and an internal API endpoint for a future local blind-fill MCP to consume.

**Architecture:** New `vaults`, `vault_items`, `vault_item_fields`, and `token_vault_permissions` tables. Service layer for CRUD + search + encryption. MCP `vault_search` tool. Dashboard pages for vault management. Internal bearer-auth endpoint for sensitive field value retrieval.

**Tech Stack:** SvelteKit, Drizzle ORM, PostgreSQL, `node:crypto` (AES-256-GCM), Vitest + Testcontainers, shadcn-svelte

**Linear:** DEA-4148

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `src/lib/server/utils/crypto.ts` | AES-256-GCM encrypt/decrypt |
| Create | `src/lib/server/services/vaults.ts` | Vault CRUD |
| Create | `src/lib/server/services/vault-items.ts` | Item + field CRUD, search, encrypt/decrypt fields |
| Create | `src/lib/server/services/vault-permissions.ts` | Token ↔ vault permission CRUD |
| Create | `src/lib/server/mcp/tools/vaults.ts` | MCP vault_search tool function |
| Create | `src/routes/(app)/vaults/+page.server.ts` | Vaults list page load + actions |
| Create | `src/routes/(app)/vaults/+page.svelte` | Vaults list UI |
| Create | `src/routes/(app)/vaults/[slug]/+page.server.ts` | Vault detail (items) load + actions |
| Create | `src/routes/(app)/vaults/[slug]/+page.svelte` | Vault detail UI |
| Create | `src/routes/(app)/vaults/[slug]/[itemSlug]/+page.server.ts` | Item detail (fields) load + actions |
| Create | `src/routes/(app)/vaults/[slug]/[itemSlug]/+page.svelte` | Item detail UI with password-manager UX |
| Create | `src/routes/api/vault-items/[vaultSlug]/[itemSlug]/fields/[fieldName]/value/+server.ts` | Internal endpoint for blind-fill MCP |
| Create | `tests/unit/crypto.test.ts` | Crypto util unit tests |
| Create | `tests/integration/vaults.test.ts` | Vault + item + field + permission integration tests |
| Modify | `src/lib/server/db/schema.ts` | Add 4 new tables |
| Modify | `src/lib/server/mcp/server.ts` | Register vault_search tool |
| Modify | `src/lib/components/app-sidebar.svelte` | Add "Vaults" nav item |
| Modify | `src/routes/(app)/api-keys/[id]/+page.server.ts` | Add vault permission actions |
| Modify | `src/routes/(app)/api-keys/[id]/+page.svelte` | Add vault permissions section |
| Modify | `tests/helpers.ts` | Add vault tables to truncateAll, add factory functions |
| Generate | `drizzle/NNNN_*.sql` | Auto-generated migration |

---

### Task 1: Crypto Utility

**Files:**
- Create: `src/lib/server/utils/crypto.ts`
- Create: `tests/unit/crypto.test.ts`

- [ ] **Step 1: Write failing tests for encrypt/decrypt**

```ts
// tests/unit/crypto.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { encrypt, decrypt } from "$lib/server/utils/crypto";

describe("crypto", () => {
	beforeAll(() => {
		// Set a test encryption key (32 bytes base64)
		process.env.VAULT_ENCRYPTION_KEY = Buffer.from("a]3Fq!9Lp@2Xw#7Yz&5Bv*8Cn$4Dm%6E").toString("base64");
	});

	it("encrypts and decrypts a value", () => {
		const plaintext = "my-secret-password";
		const encrypted = encrypt(plaintext);
		expect(encrypted).not.toBe(plaintext);
		expect(encrypted).toContain(":");
		const decrypted = decrypt(encrypted);
		expect(decrypted).toBe(plaintext);
	});

	it("produces different ciphertexts for the same input (random IV)", () => {
		const a = encrypt("same");
		const b = encrypt("same");
		expect(a).not.toBe(b);
	});

	it("throws on tampered ciphertext", () => {
		const encrypted = encrypt("test");
		const parts = encrypted.split(":");
		parts[1] = Buffer.from("tampered").toString("base64");
		expect(() => decrypt(parts.join(":"))).toThrow();
	});

	it("throws when VAULT_ENCRYPTION_KEY is not set", () => {
		const orig = process.env.VAULT_ENCRYPTION_KEY;
		delete process.env.VAULT_ENCRYPTION_KEY;
		expect(() => encrypt("test")).toThrow("VAULT_ENCRYPTION_KEY");
		process.env.VAULT_ENCRYPTION_KEY = orig;
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/crypto.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement crypto utility**

```ts
// src/lib/server/utils/crypto.ts
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function getKey(): Buffer {
	const b64 = process.env.VAULT_ENCRYPTION_KEY;
	if (!b64) throw new Error("VAULT_ENCRYPTION_KEY environment variable is required");
	return Buffer.from(b64, "base64");
}

export function encrypt(plaintext: string): string {
	const key = getKey();
	const iv = randomBytes(IV_LENGTH);
	const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
	const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
	const authTag = cipher.getAuthTag();
	return `${iv.toString("base64")}:${encrypted.toString("base64")}:${authTag.toString("base64")}`;
}

export function decrypt(encryptedValue: string): string {
	const key = getKey();
	const [ivB64, ciphertextB64, authTagB64] = encryptedValue.split(":");
	const iv = Buffer.from(ivB64, "base64");
	const ciphertext = Buffer.from(ciphertextB64, "base64");
	const authTag = Buffer.from(authTagB64, "base64");
	const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
	decipher.setAuthTag(authTag);
	return decipher.update(ciphertext) + decipher.final("utf8");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/crypto.test.ts`
Expected: All 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/utils/crypto.ts tests/unit/crypto.test.ts
git commit -m "feat(vault): add AES-256-GCM encrypt/decrypt utility"
```

---

### Task 2: Database Schema

**Files:**
- Modify: `src/lib/server/db/schema.ts` (after line 267, after `WikiPage` type)
- Modify: `tests/helpers.ts` (imports + truncateAll)

- [ ] **Step 1: Add vault tables to schema**

Append to end of `src/lib/server/db/schema.ts`:

```ts
export const vaults = pgTable("vaults", {
	id: uuid("id").primaryKey().defaultRandom(),
	name: varchar("name", { length: 255 }).notNull(),
	slug: varchar("slug", { length: 255 }).notNull().unique(),
	description: text("description"),
	createdAt: timestamp("created_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});

export type Vault = typeof vaults.$inferSelect;

export const vaultItems = pgTable(
	"vault_items",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		vaultId: uuid("vault_id")
			.notNull()
			.references(() => vaults.id, { onDelete: "cascade" }),
		name: varchar("name", { length: 255 }).notNull(),
		slug: varchar("slug", { length: 255 }).notNull(),
		domain: varchar("domain", { length: 255 }),
		description: text("description"),
		allowedOrigins: jsonb("allowed_origins").$type<string[]>(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [unique().on(t.vaultId, t.slug)],
);

export type VaultItem = typeof vaultItems.$inferSelect;

export const vaultItemFields = pgTable(
	"vault_item_fields",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		itemId: uuid("item_id")
			.notNull()
			.references(() => vaultItems.id, { onDelete: "cascade" }),
		name: varchar("name", { length: 255 }).notNull(),
		encryptedValue: text("encrypted_value").notNull(),
		sensitive: boolean("sensitive").notNull().default(true),
		sortOrder: integer("sort_order").notNull().default(0),
	},
	(t) => [unique().on(t.itemId, t.name)],
);

export type VaultItemField = typeof vaultItemFields.$inferSelect;

export const tokenVaultPermissions = pgTable(
	"token_vault_permissions",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		tokenId: uuid("token_id")
			.notNull()
			.references(() => tokens.id, { onDelete: "cascade" }),
		vaultId: uuid("vault_id")
			.notNull()
			.references(() => vaults.id, { onDelete: "cascade" }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [unique().on(t.tokenId, t.vaultId)],
);

export type TokenVaultPermission = typeof tokenVaultPermissions.$inferSelect;
```

- [ ] **Step 2: Update test helpers — add imports and truncation**

In `tests/helpers.ts`, add to the import from schema:

```ts
import { tokens, targets, targetAuthMethods, tokenPermissions, users, webhookEndpoints, webhookEvents, skills, memories, wikiPages, vaults, vaultItems, vaultItemFields, tokenVaultPermissions } from "$lib/server/db/schema";
```

Add to `truncateAll()`, **before** the `await db.delete(tokens)` line (because of FK constraints):

```ts
await db.delete(vaultItemFields);
await db.delete(vaultItems);
await db.delete(tokenVaultPermissions);
await db.delete(vaults);
```

- [ ] **Step 3: Generate migration**

Run: `npm run db:generate`
Expected: New migration file created in `drizzle/`

- [ ] **Step 4: Verify migration applies**

Run: `npm run db:push` (dev only — to verify schema is valid)
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/db/schema.ts tests/helpers.ts drizzle/
git commit -m "feat(vault): add vaults, vault_items, vault_item_fields, token_vault_permissions tables"
```

---

### Task 3: Vault Service

**Files:**
- Create: `src/lib/server/services/vaults.ts`
- Create: `tests/integration/vaults.test.ts` (start with vault CRUD tests)

- [ ] **Step 1: Write failing integration tests for vault CRUD**

```ts
// tests/integration/vaults.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { truncateAll } from "../helpers";
import { createVault, listVaults, getVault, getVaultBySlug, updateVault, deleteVault } from "$lib/server/services/vaults";

describe("vaults service", () => {
	beforeEach(async () => {
		await truncateAll();
	});

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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/integration/vaults.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement vault service**

```ts
// src/lib/server/services/vaults.ts
import { desc, eq } from "drizzle-orm";
import { db } from "../db";
import { vaults } from "../db/schema";
import { isUniqueViolation } from "../utils/db-error";

function slugify(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
}

export async function createVault(data: { name: string; description?: string }) {
	const slug = slugify(data.name);
	try {
		const [row] = await db
			.insert(vaults)
			.values({ name: data.name, slug, description: data.description ?? null })
			.returning();
		return row;
	} catch (err: unknown) {
		if (isUniqueViolation(err)) {
			throw new Error("slug already exists");
		}
		throw err;
	}
}

export async function listVaults() {
	return db
		.select()
		.from(vaults)
		.orderBy(desc(vaults.createdAt));
}

export async function getVault(id: string) {
	const [row] = await db.select().from(vaults).where(eq(vaults.id, id)).limit(1);
	return row ?? null;
}

export async function getVaultBySlug(slug: string) {
	const [row] = await db.select().from(vaults).where(eq(vaults.slug, slug)).limit(1);
	return row ?? null;
}

export async function updateVault(id: string, data: { name?: string; description?: string | null }) {
	const [row] = await db
		.update(vaults)
		.set({ ...data, updatedAt: new Date() })
		.where(eq(vaults.id, id))
		.returning();
	return row ?? null;
}

export async function deleteVault(id: string) {
	await db.delete(vaults).where(eq(vaults.id, id));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/integration/vaults.test.ts`
Expected: All 8 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/services/vaults.ts tests/integration/vaults.test.ts
git commit -m "feat(vault): add vault CRUD service with integration tests"
```

---

### Task 4: Vault Items & Fields Service

**Files:**
- Create: `src/lib/server/services/vault-items.ts`
- Modify: `tests/integration/vaults.test.ts` (add item + field tests)

- [ ] **Step 1: Write failing integration tests for items and fields**

Append to `tests/integration/vaults.test.ts`:

```ts
import { createItem, getItem, listItems, updateItem, deleteItem, addField, updateField, deleteField, getFieldValue, searchItems } from "$lib/server/services/vault-items";

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
			name: "GitHub Login",
			domain: "github.com",
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
		const item = await createItem(vaultId, {
			name: "ING",
			domain: "ing.nl",
			fields: [],
		});
		expect(item.allowedOrigins).toContain("https://ing.nl");
		expect(item.allowedOrigins).toContain("https://*.ing.nl");
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
		const { addVaultPermission } = await import("$lib/server/services/vault-permissions");
		const testToken = await createTestToken();
		tokenId = testToken.id;
		await addVaultPermission(tokenId, vaultId);
	});

	it("searches by domain", async () => {
		await createItem(vaultId, {
			name: "GitHub",
			domain: "github.com",
			fields: [{ name: "username", value: "user", sensitive: false }],
		});
		await createItem(vaultId, {
			name: "ING",
			domain: "ing.nl",
			fields: [],
		});
		const results = await searchItems(tokenId, "github");
		expect(results).toHaveLength(1);
		expect(results[0].domain).toBe("github.com");
	});

	it("searches by name", async () => {
		await createItem(vaultId, {
			name: "My Production Login",
			fields: [],
		});
		const results = await searchItems(tokenId, "production");
		expect(results).toHaveLength(1);
	});

	it("only returns items from permitted vaults", async () => {
		const otherVault = await createVault({ name: "Other Vault" });
		await createItem(otherVault.id, {
			name: "Secret Item",
			domain: "secret.com",
			fields: [],
		});
		const results = await searchItems(tokenId, "secret");
		expect(results).toHaveLength(0);
	});

	it("includes non-sensitive field values in results", async () => {
		await createItem(vaultId, {
			name: "Login",
			domain: "example.com",
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
```

Also add to the imports at the top of the file:

```ts
import { createTestToken } from "../helpers";
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/integration/vaults.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement vault items service**

```ts
// src/lib/server/services/vault-items.ts
import { and, eq, ilike, or, inArray, asc } from "drizzle-orm";
import { db } from "../db";
import { vaultItems, vaultItemFields, tokenVaultPermissions, vaults } from "../db/schema";
import { encrypt, decrypt } from "../utils/crypto";
import { isUniqueViolation } from "../utils/db-error";

function slugify(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
}

function deriveAllowedOrigins(domain: string): string[] {
	return [`https://${domain}`, `https://*.${domain}`];
}

type FieldInput = { name: string; value: string; sensitive?: boolean };

export async function createItem(
	vaultId: string,
	data: {
		name: string;
		domain?: string;
		description?: string;
		allowedOrigins?: string[];
		fields?: FieldInput[];
	},
) {
	const slug = slugify(data.name);
	const allowedOrigins =
		data.allowedOrigins ?? (data.domain ? deriveAllowedOrigins(data.domain) : null);

	let item;
	try {
		[item] = await db
			.insert(vaultItems)
			.values({
				vaultId,
				name: data.name,
				slug,
				domain: data.domain ?? null,
				description: data.description ?? null,
				allowedOrigins,
			})
			.returning();
	} catch (err: unknown) {
		if (isUniqueViolation(err)) throw new Error("slug already exists");
		throw err;
	}

	if (data.fields?.length) {
		await db.insert(vaultItemFields).values(
			data.fields.map((f, i) => ({
				itemId: item.id,
				name: f.name,
				encryptedValue: encrypt(f.value),
				sensitive: f.sensitive ?? true,
				sortOrder: i,
			})),
		);
	}

	return item;
}

export async function listItems(vaultId: string) {
	return db
		.select()
		.from(vaultItems)
		.where(eq(vaultItems.vaultId, vaultId))
		.orderBy(asc(vaultItems.name));
}

export async function getItem(vaultId: string, slug: string) {
	const [item] = await db
		.select()
		.from(vaultItems)
		.where(and(eq(vaultItems.vaultId, vaultId), eq(vaultItems.slug, slug)))
		.limit(1);

	if (!item) return null;

	const fields = await db
		.select()
		.from(vaultItemFields)
		.where(eq(vaultItemFields.itemId, item.id))
		.orderBy(asc(vaultItemFields.sortOrder));

	return {
		...item,
		fields: fields.map((f) => ({
			id: f.id,
			name: f.name,
			sensitive: f.sensitive,
			sortOrder: f.sortOrder,
			value: f.sensitive ? undefined : decrypt(f.encryptedValue),
		})),
	};
}

export async function getItemById(id: string) {
	const [item] = await db
		.select()
		.from(vaultItems)
		.where(eq(vaultItems.id, id))
		.limit(1);
	return item ?? null;
}

export async function updateItem(
	id: string,
	data: { name?: string; domain?: string | null; description?: string | null; allowedOrigins?: string[] | null },
) {
	const [row] = await db
		.update(vaultItems)
		.set({ ...data, updatedAt: new Date() })
		.where(eq(vaultItems.id, id))
		.returning();
	return row ?? null;
}

export async function deleteItem(id: string) {
	await db.delete(vaultItems).where(eq(vaultItems.id, id));
}

export async function addField(itemId: string, data: { name: string; value: string; sensitive?: boolean }) {
	try {
		const [row] = await db
			.insert(vaultItemFields)
			.values({
				itemId,
				name: data.name,
				encryptedValue: encrypt(data.value),
				sensitive: data.sensitive ?? true,
			})
			.returning();
		return row;
	} catch (err: unknown) {
		if (isUniqueViolation(err)) throw new Error("field name already exists");
		throw err;
	}
}

export async function updateField(id: string, data: { value?: string; sensitive?: boolean }) {
	const updates: Record<string, unknown> = {};
	if (data.value !== undefined) updates.encryptedValue = encrypt(data.value);
	if (data.sensitive !== undefined) updates.sensitive = data.sensitive;

	const [row] = await db
		.update(vaultItemFields)
		.set(updates)
		.where(eq(vaultItemFields.id, id))
		.returning();
	return row ?? null;
}

export async function deleteField(id: string) {
	await db.delete(vaultItemFields).where(eq(vaultItemFields.id, id));
}

export async function getFieldValue(itemId: string, fieldName: string): Promise<string | null> {
	const [field] = await db
		.select()
		.from(vaultItemFields)
		.where(and(eq(vaultItemFields.itemId, itemId), eq(vaultItemFields.name, fieldName)))
		.limit(1);

	if (!field) return null;
	return decrypt(field.encryptedValue);
}

export async function searchItems(tokenId: string, query: string) {
	// Get vaults this token has access to
	const permissions = await db
		.select({ vaultId: tokenVaultPermissions.vaultId })
		.from(tokenVaultPermissions)
		.where(eq(tokenVaultPermissions.tokenId, tokenId));

	if (permissions.length === 0) return [];

	const vaultIds = permissions.map((p) => p.vaultId);
	const pattern = `%${query}%`;

	const items = await db
		.select({
			id: vaultItems.id,
			vaultId: vaultItems.vaultId,
			vaultSlug: vaults.slug,
			name: vaultItems.name,
			slug: vaultItems.slug,
			domain: vaultItems.domain,
			description: vaultItems.description,
			allowedOrigins: vaultItems.allowedOrigins,
		})
		.from(vaultItems)
		.innerJoin(vaults, eq(vaultItems.vaultId, vaults.id))
		.where(
			and(
				inArray(vaultItems.vaultId, vaultIds),
				or(
					ilike(vaultItems.name, pattern),
					ilike(vaultItems.domain, pattern),
					ilike(vaultItems.description, pattern),
				),
			),
		);

	// Fetch fields for each item
	const results = await Promise.all(
		items.map(async (item) => {
			const fields = await db
				.select()
				.from(vaultItemFields)
				.where(eq(vaultItemFields.itemId, item.id))
				.orderBy(asc(vaultItemFields.sortOrder));

			return {
				handle: `${item.vaultSlug}/${item.slug}`,
				name: item.name,
				domain: item.domain,
				description: item.description,
				allowedOrigins: item.allowedOrigins,
				fields: fields.map((f) => ({
					name: f.name,
					sensitive: f.sensitive,
					value: f.sensitive ? undefined : decrypt(f.encryptedValue),
				})),
			};
		}),
	);

	return results;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/integration/vaults.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/services/vault-items.ts tests/integration/vaults.test.ts
git commit -m "feat(vault): add vault items & fields service with search and encryption"
```

---

### Task 5: Vault Permissions Service

**Files:**
- Create: `src/lib/server/services/vault-permissions.ts`
- Modify: `tests/integration/vaults.test.ts` (add permission tests)

- [ ] **Step 1: Write failing integration tests for vault permissions**

Append to `tests/integration/vaults.test.ts`:

```ts
import { addVaultPermission, removeVaultPermission, listVaultPermissions, hasVaultPermission } from "$lib/server/services/vault-permissions";

describe("vault permissions", () => {
	let tokenId: string;
	let vaultId: string;

	beforeEach(async () => {
		await truncateAll();
		const token = await createTestToken();
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/integration/vaults.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement vault permissions service**

```ts
// src/lib/server/services/vault-permissions.ts
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { tokenVaultPermissions, vaults } from "../db/schema";
import { isUniqueViolation } from "../utils/db-error";

export async function listVaultPermissions(tokenId: string) {
	return db
		.select({
			id: tokenVaultPermissions.id,
			tokenId: tokenVaultPermissions.tokenId,
			vaultId: tokenVaultPermissions.vaultId,
			createdAt: tokenVaultPermissions.createdAt,
			vault: {
				id: vaults.id,
				name: vaults.name,
				slug: vaults.slug,
			},
		})
		.from(tokenVaultPermissions)
		.innerJoin(vaults, eq(tokenVaultPermissions.vaultId, vaults.id))
		.where(eq(tokenVaultPermissions.tokenId, tokenId));
}

export async function addVaultPermission(tokenId: string, vaultId: string) {
	try {
		const [row] = await db
			.insert(tokenVaultPermissions)
			.values({ tokenId, vaultId })
			.returning();
		return row;
	} catch (err: unknown) {
		if (isUniqueViolation(err)) {
			throw new Error("permission already exists");
		}
		throw err;
	}
}

export async function removeVaultPermission(tokenId: string, vaultId: string) {
	const [existing] = await db
		.select()
		.from(tokenVaultPermissions)
		.where(
			and(
				eq(tokenVaultPermissions.tokenId, tokenId),
				eq(tokenVaultPermissions.vaultId, vaultId),
			),
		)
		.limit(1);

	if (!existing) return null;

	await db
		.delete(tokenVaultPermissions)
		.where(eq(tokenVaultPermissions.id, existing.id));

	return { id: existing.id, deleted: true };
}

export async function hasVaultPermission(
	tokenId: string,
	vaultId: string,
): Promise<boolean> {
	const [row] = await db
		.select({ id: tokenVaultPermissions.id })
		.from(tokenVaultPermissions)
		.where(
			and(
				eq(tokenVaultPermissions.tokenId, tokenId),
				eq(tokenVaultPermissions.vaultId, vaultId),
			),
		)
		.limit(1);

	return !!row;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/integration/vaults.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/services/vault-permissions.ts tests/integration/vaults.test.ts
git commit -m "feat(vault): add token vault permissions service"
```

---

### Task 6: MCP vault_search Tool

**Files:**
- Create: `src/lib/server/mcp/tools/vaults.ts`
- Modify: `src/lib/server/mcp/server.ts`

- [ ] **Step 1: Create MCP tool function**

```ts
// src/lib/server/mcp/tools/vaults.ts
import type { Token } from "$lib/server/db/schema";
import { searchItems } from "$lib/server/services/vault-items";

export async function vaultSearch(token: Token, args: { query: string }) {
	if (!args.query?.trim()) {
		return { error: "query is required" };
	}

	try {
		const results = await searchItems(token.id, args.query.trim());
		return { results };
	} catch (err) {
		return { error: err instanceof Error ? err.message : "Search failed" };
	}
}
```

- [ ] **Step 2: Register tool in MCP server**

In `src/lib/server/mcp/server.ts`, add import:

```ts
import { vaultSearch } from "./tools/vaults";
```

Add tool registration inside `registerTools()` (after the wiki tools):

```ts
	server.tool(
		"vault_search",
		"Search for credential items in vaults accessible to this token. Returns item handles with non-sensitive field values (e.g. username). Sensitive values (e.g. password) are only available via the local blind-fill MCP tool.",
		{
			query: z.string().describe("Search query — matches against item name, domain, and description"),
		},
		async (args) => {
			const result = await vaultSearch(token, args);
			return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
		}
	);
```

Add case to `createMcpToolHandler` switch:

```ts
			case "vault_search":
				return vaultSearch(t, args as unknown as { query: string });
```

- [ ] **Step 3: Run existing tests to verify no regressions**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/server/mcp/tools/vaults.ts src/lib/server/mcp/server.ts
git commit -m "feat(vault): add vault_search MCP tool"
```

---

### Task 7: Internal Endpoint for Blind-Fill MCP

**Files:**
- Create: `src/routes/api/vault-items/[vaultSlug]/[itemSlug]/fields/[fieldName]/value/+server.ts`

- [ ] **Step 1: Create the endpoint**

```ts
// src/routes/api/vault-items/[vaultSlug]/[itemSlug]/fields/[fieldName]/value/+server.ts
import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireBearer } from "$lib/server/auth";
import { getVaultBySlug } from "$lib/server/services/vaults";
import { getItem, getFieldValue } from "$lib/server/services/vault-items";
import { hasVaultPermission } from "$lib/server/services/vault-permissions";

export const GET: RequestHandler = async ({ request, params }) => {
	const token = await requireBearer(request);

	const vault = await getVaultBySlug(params.vaultSlug);
	if (!vault) throw error(404, "Vault not found");

	const hasAccess = await hasVaultPermission(token.id, vault.id);
	if (!hasAccess) throw error(403, "No access to this vault");

	const item = await getItem(vault.id, params.itemSlug);
	if (!item) throw error(404, "Item not found");

	const value = await getFieldValue(item.id, params.fieldName);
	if (value === null) throw error(404, "Field not found");

	return json({ value });
};
```

- [ ] **Step 2: Verify the route loads**

Run: `npm run dev` and verify no build errors. The endpoint requires bearer auth so it won't return data without a valid token, but it should compile.

- [ ] **Step 3: Commit**

```bash
git add src/routes/api/vault-items/
git commit -m "feat(vault): add internal endpoint for blind-fill secret value retrieval"
```

---

### Task 8: Dashboard — Vaults List Page

**Files:**
- Create: `src/routes/(app)/vaults/+page.server.ts`
- Create: `src/routes/(app)/vaults/+page.svelte`
- Modify: `src/lib/components/app-sidebar.svelte`

- [ ] **Step 1: Add sidebar nav item**

In `src/lib/components/app-sidebar.svelte`, add to the "Gateway" group items array, after the Wiki entry:

```ts
{ title: "Vaults", url: "/vaults" },
```

- [ ] **Step 2: Create vaults list page server**

```ts
// src/routes/(app)/vaults/+page.server.ts
import { fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { createVault, listVaults, deleteVault } from "$lib/server/services/vaults";

export const load: PageServerLoad = async () => {
	const vaultsList = await listVaults();
	return { vaults: vaultsList };
};

export const actions = {
	create: async ({ request }) => {
		const data = await request.formData();
		const name = data.get("name")?.toString()?.trim() ?? "";
		const description = data.get("description")?.toString()?.trim() || undefined;

		if (!name) return fail(400, { error: "Name is required" });

		try {
			const vault = await createVault({ name, description });
			return { created: vault };
		} catch (err) {
			return fail(400, {
				error: err instanceof Error ? err.message : "Failed to create vault",
			});
		}
	},

	delete: async ({ request }) => {
		const data = await request.formData();
		const id = data.get("id")?.toString() ?? "";
		if (!id) return fail(400, { error: "ID is required" });

		await deleteVault(id);
		return { deleted: id };
	},
} satisfies Actions;
```

- [ ] **Step 3: Create vaults list page UI**

```svelte
<!-- src/routes/(app)/vaults/+page.svelte -->
<script lang="ts">
	import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage } from "$lib/components/ui/breadcrumb";
	import { Separator } from "$lib/components/ui/separator";
	import { SidebarTrigger } from "$lib/components/ui/sidebar";
	import * as Table from "$lib/components/ui/table";
	import * as Dialog from "$lib/components/ui/dialog";
	import { Button } from "$lib/components/ui/button";
	import { Input } from "$lib/components/ui/input";
	import { Label } from "$lib/components/ui/label";
	import { Badge } from "$lib/components/ui/badge";
	import { toast } from "svelte-sonner";
	import PlusIcon from "lucide-svelte/icons/plus";
	import TrashIcon from "lucide-svelte/icons/trash-2";
	import KeyRoundIcon from "lucide-svelte/icons/key-round";
	import { formatDate } from "$lib/utils";

	let { data } = $props();

	type Vault = (typeof data.vaults)[number];

	let localVaults = $state<Vault[] | null>(null);
	let vaultsList = $derived(localVaults ?? data.vaults);

	let createOpen = $state(false);
	let createSubmitting = $state(false);
	let deleteOpen = $state(false);
	let deleteSubmitting = $state(false);
	let deleteTarget = $state<Vault | null>(null);
</script>

<header class="flex h-16 shrink-0 items-center gap-2 border-b px-4">
	<SidebarTrigger class="-ml-1" />
	<Separator orientation="vertical" class="mr-2 h-4" />
	<Breadcrumb>
		<BreadcrumbList>
			<BreadcrumbItem>
				<BreadcrumbPage>Vaults</BreadcrumbPage>
			</BreadcrumbItem>
		</BreadcrumbList>
	</Breadcrumb>
</header>

<div class="flex flex-1 flex-col gap-4 p-4">
	<div class="flex items-center justify-between">
		<h2 class="text-lg font-semibold">Vaults</h2>
		<Button size="sm" onclick={() => (createOpen = true)}>
			<PlusIcon class="mr-2 h-4 w-4" />
			New Vault
		</Button>
	</div>

	{#if vaultsList.length === 0}
		<div class="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
			<KeyRoundIcon class="mb-4 h-12 w-12 text-muted-foreground" />
			<h3 class="text-lg font-semibold">No vaults yet</h3>
			<p class="mb-4 text-sm text-muted-foreground">Create a vault to start storing credentials.</p>
			<Button size="sm" onclick={() => (createOpen = true)}>Create Vault</Button>
		</div>
	{:else}
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head>Name</Table.Head>
					<Table.Head>Description</Table.Head>
					<Table.Head>Created</Table.Head>
					<Table.Head class="w-20"></Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each vaultsList as vault (vault.id)}
					<Table.Row>
						<Table.Cell class="font-medium">
							<a href="/vaults/{vault.slug}" class="hover:underline">{vault.name}</a>
						</Table.Cell>
						<Table.Cell class="text-muted-foreground">{vault.description ?? "—"}</Table.Cell>
						<Table.Cell>{formatDate(vault.createdAt)}</Table.Cell>
						<Table.Cell>
							<Button
								variant="ghost"
								size="icon"
								onclick={() => {
									deleteTarget = vault;
									deleteOpen = true;
								}}
							>
								<TrashIcon class="h-4 w-4" />
							</Button>
						</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	{/if}
</div>

<!-- Create Dialog -->
<Dialog.Root bind:open={createOpen}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Create Vault</Dialog.Title>
			<Dialog.Description>Group related credentials together.</Dialog.Description>
		</Dialog.Header>
		<form
			method="POST"
			action="?/create"
			use:enhance={() => {
				createSubmitting = true;
				return async ({ result, update }) => {
					createSubmitting = false;
					if (result.type === "success" && result.data?.created) {
						localVaults = [result.data.created as Vault, ...vaultsList];
						createOpen = false;
						toast.success("Vault created");
					} else if (result.type === "failure") {
						toast.error(result.data?.error ?? "Failed to create vault");
					}
					await update({ reset: false, invalidateAll: false });
				};
			}}
		>
			<div class="grid gap-4 py-4">
				<div class="grid gap-2">
					<Label for="name">Name</Label>
					<Input id="name" name="name" placeholder="Production Credentials" required />
				</div>
				<div class="grid gap-2">
					<Label for="description">Description (optional)</Label>
					<Input id="description" name="description" placeholder="Credentials for production services" />
				</div>
			</div>
			<Dialog.Footer>
				<Button type="submit" disabled={createSubmitting}>
					{createSubmitting ? "Creating..." : "Create"}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>

<!-- Delete Dialog -->
<Dialog.Root bind:open={deleteOpen}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Delete Vault</Dialog.Title>
			<Dialog.Description>
				This will permanently delete <strong>{deleteTarget?.name}</strong> and all its items and fields.
			</Dialog.Description>
		</Dialog.Header>
		<form
			method="POST"
			action="?/delete"
			use:enhance={() => {
				deleteSubmitting = true;
				return async ({ result, update }) => {
					deleteSubmitting = false;
					if (result.type === "success" && result.data?.deleted) {
						localVaults = vaultsList.filter((v) => v.id !== result.data!.deleted);
						deleteOpen = false;
						toast.success("Vault deleted");
					}
					await update({ reset: false, invalidateAll: false });
				};
			}}
		>
			<input type="hidden" name="id" value={deleteTarget?.id ?? ""} />
			<Dialog.Footer>
				<Button variant="outline" type="button" onclick={() => (deleteOpen = false)}>Cancel</Button>
				<Button variant="destructive" type="submit" disabled={deleteSubmitting}>
					{deleteSubmitting ? "Deleting..." : "Delete"}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
```

Add the `enhance` import at the top of the script:

```ts
import { enhance } from "$app/forms";
```

- [ ] **Step 4: Run dev server and verify page renders**

Run: `npm run dev`
Navigate to `/vaults` — should show empty state with "Create Vault" button.

- [ ] **Step 5: Commit**

```bash
git add src/routes/\(app\)/vaults/ src/lib/components/app-sidebar.svelte
git commit -m "feat(vault): add vaults list dashboard page with create/delete"
```

---

### Task 9: Dashboard — Vault Detail Page (Items)

**Files:**
- Create: `src/routes/(app)/vaults/[slug]/+page.server.ts`
- Create: `src/routes/(app)/vaults/[slug]/+page.svelte`

- [ ] **Step 1: Create vault detail page server**

```ts
// src/routes/(app)/vaults/[slug]/+page.server.ts
import { error, fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { getVaultBySlug } from "$lib/server/services/vaults";
import { createItem, listItems, deleteItem } from "$lib/server/services/vault-items";

export const load: PageServerLoad = async ({ params }) => {
	const vault = await getVaultBySlug(params.slug);
	if (!vault) throw error(404, "Vault not found");

	const items = await listItems(vault.id);
	return { vault, items };
};

export const actions = {
	createItem: async ({ request, params }) => {
		const vault = await getVaultBySlug(params.slug);
		if (!vault) return fail(404, { error: "Vault not found" });

		const data = await request.formData();
		const name = data.get("name")?.toString()?.trim() ?? "";
		const domain = data.get("domain")?.toString()?.trim() || undefined;
		const description = data.get("description")?.toString()?.trim() || undefined;

		if (!name) return fail(400, { error: "Name is required" });

		try {
			const item = await createItem(vault.id, { name, domain, description });
			return { created: item };
		} catch (err) {
			return fail(400, {
				error: err instanceof Error ? err.message : "Failed to create item",
			});
		}
	},

	deleteItem: async ({ request }) => {
		const data = await request.formData();
		const id = data.get("id")?.toString() ?? "";
		if (!id) return fail(400, { error: "ID is required" });

		await deleteItem(id);
		return { deleted: id };
	},
} satisfies Actions;
```

- [ ] **Step 2: Create vault detail page UI**

```svelte
<!-- src/routes/(app)/vaults/[slug]/+page.svelte -->
<script lang="ts">
	import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "$lib/components/ui/breadcrumb";
	import { Separator } from "$lib/components/ui/separator";
	import { SidebarTrigger } from "$lib/components/ui/sidebar";
	import * as Table from "$lib/components/ui/table";
	import * as Dialog from "$lib/components/ui/dialog";
	import { Button } from "$lib/components/ui/button";
	import { Input } from "$lib/components/ui/input";
	import { Label } from "$lib/components/ui/label";
	import { Badge } from "$lib/components/ui/badge";
	import { toast } from "svelte-sonner";
	import { enhance } from "$app/forms";
	import PlusIcon from "lucide-svelte/icons/plus";
	import TrashIcon from "lucide-svelte/icons/trash-2";
	import GlobeIcon from "lucide-svelte/icons/globe";
	import { formatDate } from "$lib/utils";

	let { data } = $props();

	type Item = (typeof data.items)[number];

	let localItems = $state<Item[] | null>(null);
	let itemsList = $derived(localItems ?? data.items);

	let createOpen = $state(false);
	let createSubmitting = $state(false);
	let deleteOpen = $state(false);
	let deleteSubmitting = $state(false);
	let deleteTarget = $state<Item | null>(null);
</script>

<header class="flex h-16 shrink-0 items-center gap-2 border-b px-4">
	<SidebarTrigger class="-ml-1" />
	<Separator orientation="vertical" class="mr-2 h-4" />
	<Breadcrumb>
		<BreadcrumbList>
			<BreadcrumbItem><BreadcrumbLink href="/vaults">Vaults</BreadcrumbLink></BreadcrumbItem>
			<BreadcrumbSeparator />
			<BreadcrumbItem><BreadcrumbPage>{data.vault.name}</BreadcrumbPage></BreadcrumbItem>
		</BreadcrumbList>
	</Breadcrumb>
</header>

<div class="flex flex-1 flex-col gap-4 p-4">
	<div class="flex items-center justify-between">
		<div>
			<h2 class="text-lg font-semibold">{data.vault.name}</h2>
			{#if data.vault.description}
				<p class="text-sm text-muted-foreground">{data.vault.description}</p>
			{/if}
		</div>
		<Button size="sm" onclick={() => (createOpen = true)}>
			<PlusIcon class="mr-2 h-4 w-4" />
			New Item
		</Button>
	</div>

	{#if itemsList.length === 0}
		<div class="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
			<h3 class="text-lg font-semibold">No items yet</h3>
			<p class="mb-4 text-sm text-muted-foreground">Add credential items to this vault.</p>
			<Button size="sm" onclick={() => (createOpen = true)}>Add Item</Button>
		</div>
	{:else}
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head>Name</Table.Head>
					<Table.Head>Domain</Table.Head>
					<Table.Head>Created</Table.Head>
					<Table.Head class="w-20"></Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each itemsList as item (item.id)}
					<Table.Row>
						<Table.Cell class="font-medium">
							<a href="/vaults/{data.vault.slug}/{item.slug}" class="hover:underline">{item.name}</a>
						</Table.Cell>
						<Table.Cell>
							{#if item.domain}
								<Badge variant="outline"><GlobeIcon class="mr-1 h-3 w-3" />{item.domain}</Badge>
							{:else}
								<span class="text-muted-foreground">—</span>
							{/if}
						</Table.Cell>
						<Table.Cell>{formatDate(item.createdAt)}</Table.Cell>
						<Table.Cell>
							<Button
								variant="ghost"
								size="icon"
								onclick={() => {
									deleteTarget = item;
									deleteOpen = true;
								}}
							>
								<TrashIcon class="h-4 w-4" />
							</Button>
						</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	{/if}
</div>

<!-- Create Item Dialog -->
<Dialog.Root bind:open={createOpen}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Add Item</Dialog.Title>
			<Dialog.Description>Add a credential set to this vault (e.g., a login).</Dialog.Description>
		</Dialog.Header>
		<form
			method="POST"
			action="?/createItem"
			use:enhance={() => {
				createSubmitting = true;
				return async ({ result, update }) => {
					createSubmitting = false;
					if (result.type === "success" && result.data?.created) {
						localItems = [...itemsList, result.data.created as Item];
						createOpen = false;
						toast.success("Item created");
					} else if (result.type === "failure") {
						toast.error(result.data?.error ?? "Failed");
					}
					await update({ reset: false, invalidateAll: false });
				};
			}}
		>
			<div class="grid gap-4 py-4">
				<div class="grid gap-2">
					<Label for="name">Name</Label>
					<Input id="name" name="name" placeholder="GitHub Login" required />
				</div>
				<div class="grid gap-2">
					<Label for="domain">Domain (optional)</Label>
					<Input id="domain" name="domain" placeholder="github.com" />
				</div>
				<div class="grid gap-2">
					<Label for="description">Description (optional)</Label>
					<Input id="description" name="description" placeholder="Organization account" />
				</div>
			</div>
			<Dialog.Footer>
				<Button type="submit" disabled={createSubmitting}>
					{createSubmitting ? "Creating..." : "Create"}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>

<!-- Delete Item Dialog -->
<Dialog.Root bind:open={deleteOpen}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Delete Item</Dialog.Title>
			<Dialog.Description>
				This will permanently delete <strong>{deleteTarget?.name}</strong> and all its fields.
			</Dialog.Description>
		</Dialog.Header>
		<form
			method="POST"
			action="?/deleteItem"
			use:enhance={() => {
				deleteSubmitting = true;
				return async ({ result, update }) => {
					deleteSubmitting = false;
					if (result.type === "success" && result.data?.deleted) {
						localItems = itemsList.filter((i) => i.id !== result.data!.deleted);
						deleteOpen = false;
						toast.success("Item deleted");
					}
					await update({ reset: false, invalidateAll: false });
				};
			}}
		>
			<input type="hidden" name="id" value={deleteTarget?.id ?? ""} />
			<Dialog.Footer>
				<Button variant="outline" type="button" onclick={() => (deleteOpen = false)}>Cancel</Button>
				<Button variant="destructive" type="submit" disabled={deleteSubmitting}>
					{deleteSubmitting ? "Deleting..." : "Delete"}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
```

- [ ] **Step 3: Run dev server and verify**

Navigate to `/vaults`, create a vault, click into it. Should show empty items list with "Add Item".

- [ ] **Step 4: Commit**

```bash
git add src/routes/\(app\)/vaults/\[slug\]/
git commit -m "feat(vault): add vault detail page with item create/delete"
```

---

### Task 10: Dashboard — Item Detail Page (Fields, Password-Manager UX)

**Files:**
- Create: `src/routes/(app)/vaults/[slug]/[itemSlug]/+page.server.ts`
- Create: `src/routes/(app)/vaults/[slug]/[itemSlug]/+page.svelte`

- [ ] **Step 1: Create item detail page server**

```ts
// src/routes/(app)/vaults/[slug]/[itemSlug]/+page.server.ts
import { error, fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { getVaultBySlug } from "$lib/server/services/vaults";
import { getItem, addField, updateField, deleteField, getFieldValue, updateItem } from "$lib/server/services/vault-items";

export const load: PageServerLoad = async ({ params }) => {
	const vault = await getVaultBySlug(params.slug);
	if (!vault) throw error(404, "Vault not found");

	const item = await getItem(vault.id, params.itemSlug);
	if (!item) throw error(404, "Item not found");

	return { vault, item };
};

export const actions = {
	updateItem: async ({ request, params }) => {
		const vault = await getVaultBySlug(params.slug);
		if (!vault) return fail(404, { error: "Vault not found" });
		const item = await getItem(vault.id, params.itemSlug);
		if (!item) return fail(404, { error: "Item not found" });

		const data = await request.formData();
		const domain = data.get("domain")?.toString()?.trim() || null;
		const description = data.get("description")?.toString()?.trim() || null;

		const updated = await updateItem(item.id, { domain, description });
		return { updated };
	},

	addField: async ({ request, params }) => {
		const vault = await getVaultBySlug(params.slug);
		if (!vault) return fail(404, { error: "Vault not found" });
		const item = await getItem(vault.id, params.itemSlug);
		if (!item) return fail(404, { error: "Item not found" });

		const data = await request.formData();
		const name = data.get("name")?.toString()?.trim() ?? "";
		const value = data.get("value")?.toString() ?? "";
		const sensitive = data.get("sensitive") === "true";

		if (!name) return fail(400, { error: "Field name is required" });

		try {
			const field = await addField(item.id, { name, value, sensitive });
			return { fieldAdded: field };
		} catch (err) {
			return fail(400, { error: err instanceof Error ? err.message : "Failed" });
		}
	},

	updateField: async ({ request }) => {
		const data = await request.formData();
		const id = data.get("id")?.toString() ?? "";
		const value = data.get("value")?.toString();
		const sensitive = data.get("sensitive");

		const updates: { value?: string; sensitive?: boolean } = {};
		if (value !== undefined && value !== null) updates.value = value;
		if (sensitive !== undefined && sensitive !== null) updates.sensitive = sensitive === "true";

		const updated = await updateField(id, updates);
		if (!updated) return fail(404, { error: "Field not found" });
		return { fieldUpdated: id };
	},

	deleteField: async ({ request }) => {
		const data = await request.formData();
		const id = data.get("id")?.toString() ?? "";
		await deleteField(id);
		return { fieldDeleted: id };
	},

	revealField: async ({ request, params }) => {
		const vault = await getVaultBySlug(params.slug);
		if (!vault) return fail(404, { error: "Vault not found" });
		const item = await getItem(vault.id, params.itemSlug);
		if (!item) return fail(404, { error: "Item not found" });

		const data = await request.formData();
		const fieldName = data.get("fieldName")?.toString() ?? "";
		const value = await getFieldValue(item.id, fieldName);
		if (value === null) return fail(404, { error: "Field not found" });

		return { revealed: { fieldName, value } };
	},
} satisfies Actions;
```

- [ ] **Step 2: Create item detail page UI with password-manager UX**

```svelte
<!-- src/routes/(app)/vaults/[slug]/[itemSlug]/+page.svelte -->
<script lang="ts">
	import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "$lib/components/ui/breadcrumb";
	import { Separator } from "$lib/components/ui/separator";
	import { SidebarTrigger } from "$lib/components/ui/sidebar";
	import * as Dialog from "$lib/components/ui/dialog";
	import { Button } from "$lib/components/ui/button";
	import { Input } from "$lib/components/ui/input";
	import { Label } from "$lib/components/ui/label";
	import { Badge } from "$lib/components/ui/badge";
	import { Switch } from "$lib/components/ui/switch";
	import { toast } from "svelte-sonner";
	import { enhance } from "$app/forms";
	import PlusIcon from "lucide-svelte/icons/plus";
	import TrashIcon from "lucide-svelte/icons/trash-2";
	import EyeIcon from "lucide-svelte/icons/eye";
	import EyeOffIcon from "lucide-svelte/icons/eye-off";
	import CopyIcon from "lucide-svelte/icons/copy";
	import PencilIcon from "lucide-svelte/icons/pencil";
	import GlobeIcon from "lucide-svelte/icons/globe";

	let { data } = $props();

	let addFieldOpen = $state(false);
	let addFieldSubmitting = $state(false);
	let revealedValues = $state<Record<string, string>>({});
	let editingField = $state<string | null>(null);
	let editValue = $state("");

	function copyToClipboard(text: string) {
		navigator.clipboard.writeText(text);
		toast.success("Copied to clipboard");
		setTimeout(() => navigator.clipboard.writeText(""), 30000);
	}
</script>

<header class="flex h-16 shrink-0 items-center gap-2 border-b px-4">
	<SidebarTrigger class="-ml-1" />
	<Separator orientation="vertical" class="mr-2 h-4" />
	<Breadcrumb>
		<BreadcrumbList>
			<BreadcrumbItem><BreadcrumbLink href="/vaults">Vaults</BreadcrumbLink></BreadcrumbItem>
			<BreadcrumbSeparator />
			<BreadcrumbItem><BreadcrumbLink href="/vaults/{data.vault.slug}">{data.vault.name}</BreadcrumbLink></BreadcrumbItem>
			<BreadcrumbSeparator />
			<BreadcrumbItem><BreadcrumbPage>{data.item.name}</BreadcrumbPage></BreadcrumbItem>
		</BreadcrumbList>
	</Breadcrumb>
</header>

<div class="flex flex-1 flex-col gap-6 p-4">
	<!-- Item metadata -->
	<div class="rounded-lg border p-6">
		<h3 class="mb-4 text-sm font-semibold uppercase text-muted-foreground">Details</h3>
		<dl class="grid grid-cols-2 gap-4 text-sm">
			<div>
				<dt class="text-muted-foreground">Handle</dt>
				<dd class="font-mono">{data.vault.slug}/{data.item.slug}</dd>
			</div>
			<div>
				<dt class="text-muted-foreground">Domain</dt>
				<dd>
					{#if data.item.domain}
						<Badge variant="outline"><GlobeIcon class="mr-1 h-3 w-3" />{data.item.domain}</Badge>
					{:else}
						—
					{/if}
				</dd>
			</div>
			{#if data.item.description}
				<div class="col-span-2">
					<dt class="text-muted-foreground">Description</dt>
					<dd>{data.item.description}</dd>
				</div>
			{/if}
			{#if data.item.allowedOrigins?.length}
				<div class="col-span-2">
					<dt class="text-muted-foreground">Allowed Origins</dt>
					<dd class="flex gap-1">
						{#each data.item.allowedOrigins as origin}
							<Badge variant="secondary">{origin}</Badge>
						{/each}
					</dd>
				</div>
			{/if}
		</dl>
	</div>

	<!-- Fields -->
	<div class="rounded-lg border p-6">
		<div class="mb-4 flex items-center justify-between">
			<h3 class="text-sm font-semibold uppercase text-muted-foreground">Fields</h3>
			<Button size="sm" variant="outline" onclick={() => (addFieldOpen = true)}>
				<PlusIcon class="mr-2 h-4 w-4" />
				Add Field
			</Button>
		</div>

		{#if data.item.fields.length === 0}
			<p class="text-sm text-muted-foreground">No fields yet. Add a username, password, or other credential.</p>
		{:else}
			<div class="space-y-3">
				{#each data.item.fields as field (field.id)}
					<div class="flex items-center gap-3 rounded-md border p-3">
						<div class="min-w-0 flex-1">
							<div class="mb-1 flex items-center gap-2">
								<span class="text-sm font-medium">{field.name}</span>
								{#if field.sensitive}
									<Badge variant="secondary" class="text-xs">sensitive</Badge>
								{/if}
							</div>
							<div class="font-mono text-sm">
								{#if field.sensitive}
									{#if revealedValues[field.name]}
										<span>{revealedValues[field.name]}</span>
									{:else}
										<span class="text-muted-foreground">••••••••••••</span>
									{/if}
								{:else}
									<span>{field.value}</span>
								{/if}
							</div>
						</div>

						<div class="flex items-center gap-1">
							{#if field.sensitive}
								<!-- Reveal/hide toggle -->
								{#if revealedValues[field.name]}
									<Button
										variant="ghost"
										size="icon"
										onclick={() => {
											const next = { ...revealedValues };
											delete next[field.name];
											revealedValues = next;
										}}
									>
										<EyeOffIcon class="h-4 w-4" />
									</Button>
								{:else}
									<form
										method="POST"
										action="?/revealField"
										use:enhance={() => {
											return async ({ result, update }) => {
												if (result.type === "success" && result.data?.revealed) {
													const r = result.data.revealed as { fieldName: string; value: string };
													revealedValues = { ...revealedValues, [r.fieldName]: r.value };
													setTimeout(() => {
														const next = { ...revealedValues };
														delete next[r.fieldName];
														revealedValues = next;
													}, 10000);
												}
												await update({ reset: false, invalidateAll: false });
											};
										}}
									>
										<input type="hidden" name="fieldName" value={field.name} />
										<Button variant="ghost" size="icon" type="submit">
											<EyeIcon class="h-4 w-4" />
										</Button>
									</form>
								{/if}

								<!-- Copy -->
								<form
									method="POST"
									action="?/revealField"
									use:enhance={() => {
										return async ({ result, update }) => {
											if (result.type === "success" && result.data?.revealed) {
												const r = result.data.revealed as { fieldName: string; value: string };
												copyToClipboard(r.value);
											}
											await update({ reset: false, invalidateAll: false });
										};
									}}
								>
									<input type="hidden" name="fieldName" value={field.name} />
									<Button variant="ghost" size="icon" type="submit">
										<CopyIcon class="h-4 w-4" />
									</Button>
								</form>
							{:else}
								<!-- Non-sensitive: direct copy -->
								<Button variant="ghost" size="icon" onclick={() => copyToClipboard(field.value ?? "")}>
									<CopyIcon class="h-4 w-4" />
								</Button>
							{/if}

							<!-- Edit -->
							<Button
								variant="ghost"
								size="icon"
								onclick={() => {
									editingField = field.id;
									editValue = field.sensitive ? "" : (field.value ?? "");
								}}
							>
								<PencilIcon class="h-4 w-4" />
							</Button>

							<!-- Delete -->
							<form
								method="POST"
								action="?/deleteField"
								use:enhance={() => {
									return async ({ result, update }) => {
										if (result.type === "success") {
											toast.success("Field deleted");
										}
										await update({ reset: false, invalidateAll: true });
									};
								}}
							>
								<input type="hidden" name="id" value={field.id} />
								<Button variant="ghost" size="icon" type="submit">
									<TrashIcon class="h-4 w-4" />
								</Button>
							</form>
						</div>
					</div>

					<!-- Inline edit form -->
					{#if editingField === field.id}
						<form
							method="POST"
							action="?/updateField"
							class="flex items-center gap-2 rounded-md border border-primary/20 bg-muted/50 p-3"
							use:enhance={() => {
								return async ({ result, update }) => {
									if (result.type === "success") {
										editingField = null;
										toast.success("Field updated");
									} else if (result.type === "failure") {
										toast.error(result.data?.error ?? "Failed");
									}
									await update({ reset: false, invalidateAll: true });
								};
							}}
						>
							<input type="hidden" name="id" value={field.id} />
							<Input
								name="value"
								type={field.sensitive ? "password" : "text"}
								placeholder={field.sensitive ? "Enter new value" : "Value"}
								bind:value={editValue}
								class="flex-1"
							/>
							<Button size="sm" type="submit">Save</Button>
							<Button size="sm" variant="outline" type="button" onclick={() => (editingField = null)}>Cancel</Button>
						</form>
					{/if}
				{/each}
			</div>
		{/if}
	</div>
</div>

<!-- Add Field Dialog -->
<Dialog.Root bind:open={addFieldOpen}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Add Field</Dialog.Title>
			<Dialog.Description>Add a credential field to this item.</Dialog.Description>
		</Dialog.Header>
		<form
			method="POST"
			action="?/addField"
			use:enhance={() => {
				addFieldSubmitting = true;
				return async ({ result, update }) => {
					addFieldSubmitting = false;
					if (result.type === "success") {
						addFieldOpen = false;
						toast.success("Field added");
					} else if (result.type === "failure") {
						toast.error(result.data?.error ?? "Failed");
					}
					await update({ reset: false, invalidateAll: true });
				};
			}}
		>
			<div class="grid gap-4 py-4">
				<div class="grid gap-2">
					<Label for="fieldName">Name</Label>
					<Input id="fieldName" name="name" placeholder="password" required />
				</div>
				<div class="grid gap-2">
					<Label for="fieldValue">Value</Label>
					<Input id="fieldValue" name="value" type="password" required />
				</div>
				<div class="flex items-center gap-2">
					<input type="hidden" name="sensitive" value="true" id="sensitiveHidden" />
					<Switch
						id="sensitive"
						checked={true}
						onCheckedChange={(checked) => {
							const hidden = document.getElementById("sensitiveHidden") as HTMLInputElement;
							if (hidden) hidden.value = String(checked);
						}}
					/>
					<Label for="sensitive">Sensitive (hidden from agents)</Label>
				</div>
			</div>
			<Dialog.Footer>
				<Button type="submit" disabled={addFieldSubmitting}>
					{addFieldSubmitting ? "Adding..." : "Add Field"}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
```

- [ ] **Step 3: Run dev server and test the full flow**

Create a vault → add item → add fields (sensitive + non-sensitive) → verify reveal/hide/copy/edit.

- [ ] **Step 4: Commit**

```bash
git add src/routes/\(app\)/vaults/\[slug\]/\[itemSlug\]/
git commit -m "feat(vault): add item detail page with password-manager field UX"
```

---

### Task 11: Vault Permissions on API Keys Page

**Files:**
- Modify: `src/routes/(app)/api-keys/[id]/+page.server.ts`
- Modify: `src/routes/(app)/api-keys/[id]/+page.svelte`

- [ ] **Step 1: Add vault permission actions to page server**

In `src/routes/(app)/api-keys/[id]/+page.server.ts`, add imports:

```ts
import { listVaults } from "$lib/server/services/vaults";
import { listVaultPermissions, addVaultPermission, removeVaultPermission } from "$lib/server/services/vault-permissions";
```

Add to the `load` function's `Promise.all`:

```ts
const [allTargets, permissions, allVaults, vaultPerms] = await Promise.all([
	listTargets(),
	listPermissions(params.id),
	listVaults(),
	listVaultPermissions(params.id),
]);
return { token, targets: allTargets, permissions, vaults: allVaults, vaultPermissions: vaultPerms };
```

Add form actions:

```ts
grantVault: async ({ request, params }) => {
	const data = await request.formData();
	const vaultId = data.get("vaultId")?.toString() ?? "";
	if (!vaultId) return fail(400, { error: "Vault ID is required" });
	const token = await getToken(params.id);
	if (!token) return fail(404, { error: "Token not found" });
	try {
		await addVaultPermission(token.id, vaultId);
		return { vaultGranted: vaultId };
	} catch (err) {
		return fail(400, { error: err instanceof Error ? err.message : "Failed" });
	}
},

revokeVault: async ({ request, params }) => {
	const data = await request.formData();
	const vaultId = data.get("vaultId")?.toString() ?? "";
	const token = await getToken(params.id);
	if (!token) return fail(404, { error: "Token not found" });
	const result = await removeVaultPermission(token.id, vaultId);
	if (!result) return fail(404, { error: "Permission not found" });
	return { vaultRevoked: vaultId };
},
```

- [ ] **Step 2: Add vault permissions UI section to page**

In `src/routes/(app)/api-keys/[id]/+page.svelte`, add a new section after the existing target permissions table. Follow the exact same pattern (hidden form + Switch toggle):

```svelte
<!-- Vault Permissions -->
<div class="rounded-lg border p-6">
	<h3 class="mb-4 text-sm font-semibold uppercase text-muted-foreground">Vault Access</h3>
	{#if data.vaults.length === 0}
		<p class="text-sm text-muted-foreground">No vaults configured. <a href="/vaults" class="underline">Create one</a>.</p>
	{:else}
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head>Vault</Table.Head>
					<Table.Head>Description</Table.Head>
					<Table.Head class="w-20">Access</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each data.vaults as vault (vault.id)}
					{@const hasAccess = vaultPermSet.has(vault.id)}
					<Table.Row>
						<Table.Cell class="font-medium">
							<a href="/vaults/{vault.slug}" class="hover:underline">{vault.name}</a>
						</Table.Cell>
						<Table.Cell class="text-muted-foreground">{vault.description ?? "—"}</Table.Cell>
						<Table.Cell>
							<form method="POST" action={hasAccess ? "?/revokeVault" : "?/grantVault"} class="hidden" id="vault-perm-{vault.id}"
								use:enhance={() => {
									return async ({ result, update }) => {
										if (result.type === "success") {
											const next = new Set(vaultPermSet);
											if (hasAccess) {
												next.delete(vault.id);
												toast.success("Vault access revoked");
											} else {
												next.add(vault.id);
												toast.success("Vault access granted");
											}
											localVaultPermSet = next;
										}
										await update({ reset: false, invalidateAll: false });
									};
								}}
							>
								<input type="hidden" name="vaultId" value={vault.id} />
							</form>
							<Switch
								checked={hasAccess}
								onCheckedChange={() => (document.getElementById(`vault-perm-${vault.id}`) as HTMLFormElement)?.requestSubmit()}
							/>
						</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	{/if}
</div>
```

Add the state management:

```ts
let localVaultPermSet = $state<Set<string> | null>(null);
let vaultPermSet = $derived<Set<string>>(
	localVaultPermSet ?? new Set((data.vaultPermissions as { vaultId: string }[]).map((p) => p.vaultId))
);
```

- [ ] **Step 3: Run dev server and verify**

Navigate to `/api-keys/[id]` — should show vault permissions section with switches.

- [ ] **Step 4: Commit**

```bash
git add src/routes/\(app\)/api-keys/\[id\]/
git commit -m "feat(vault): add vault permissions to API key detail page"
```

---

### Task 12: Discover Integration

**Files:**
- Modify: `src/lib/server/mcp/tools/discover.ts`

- [ ] **Step 1: Add vault count to discover response**

Read `src/lib/server/mcp/tools/discover.ts` to understand the current structure, then add vault information. Import the vault permissions service and count accessible vaults:

```ts
import { listVaultPermissions } from "$lib/server/services/vault-permissions";
```

In the discover function, add:

```ts
const vaultPerms = await listVaultPermissions(token.id);
```

Include in the response:

```ts
vaultCount: vaultPerms.length,
vaults: vaultPerms.map(p => ({ name: p.vault.name, slug: p.vault.slug })),
```

- [ ] **Step 2: Update MCP instructions**

In `src/lib/server/mcp/server.ts`, update the `INSTRUCTIONS` string to mention vault_search:

Add to instructions: `Call vault_search when you need credentials for browser automation — it returns handles for blind-fill, not secret values.`

- [ ] **Step 3: Run existing tests**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/server/mcp/tools/discover.ts src/lib/server/mcp/server.ts
git commit -m "feat(vault): integrate vault info into discover response and MCP instructions"
```

---

### Task 13: Final Integration Test & Cleanup

**Files:**
- Modify: `tests/helpers.ts` (add vault factory functions)
- Run all tests

- [ ] **Step 1: Add vault factory functions to test helpers**

```ts
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
```

- [ ] **Step 2: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS (unit + integration)

- [ ] **Step 3: Run dev server and smoke test full flow**

1. Create vault via `/vaults`
2. Add items with fields
3. Verify reveal/hide/copy/edit on fields
4. Grant vault permission to an API key
5. Verify vault_search works via MCP

- [ ] **Step 4: Generate and commit migration**

Run: `npm run db:generate`

```bash
git add tests/helpers.ts drizzle/
git commit -m "feat(vault): add test helpers and final migration"
```

- [ ] **Step 5: Final commit — verify clean working tree**

Run: `git status`
Expected: Clean working tree, all changes committed.
