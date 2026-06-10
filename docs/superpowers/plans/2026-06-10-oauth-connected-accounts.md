# OAuth Connected Accounts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a provider-agnostic "Connected Accounts" layer that lets users connect a Microsoft 365 account via OAuth and automatically provisions managed API targets for mail and calendar (Graph API).

**Architecture:** Connected accounts are a hybrid concept — a first-class UI object that automatically generates read-only managed API targets. Credentials live on the account level; the gateway resolves them for managed targets. The existing permission system (`token_permissions`) works unchanged. Provider config (Azure AD app credentials) is stored in a new `integration_providers` table, configured via Settings.

**Tech Stack:** SvelteKit, Drizzle ORM, PostgreSQL, Microsoft Graph API, OAuth2 Authorization Code flow

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/lib/server/db/schema.ts` (modify) | Add `integrationProviders` + `connectedAccounts` tables, add `connectedAccountId` + `capability` columns to `targets` |
| Create | `src/lib/server/services/integration-providers.ts` | CRUD for OAuth provider configurations |
| Create | `src/lib/server/services/connected-accounts.ts` | Account CRUD, managed target provisioning, token refresh, disconnect |
| Modify | `src/lib/server/services/gateway.ts` | Resolve credentials from connected account for managed targets |
| Modify | `src/lib/server/services/targets.ts` | Prevent mutation of managed targets |
| Create | `src/routes/(app)/settings/+page.svelte` (modify) | Add OAuth provider configuration section |
| Create | `src/routes/(app)/settings/+page.server.ts` (modify) | Server actions for provider CRUD |
| Create | `src/routes/(app)/integrations/+page.svelte` | List connected accounts, connect/disconnect |
| Create | `src/routes/(app)/integrations/+page.server.ts` | Load accounts, handle disconnect |
| Create | `src/routes/oauth/callback/+server.ts` | OAuth callback handler (code → tokens → provision) |
| Create | `src/routes/oauth/authorize/+server.ts` | Start OAuth flow (redirect to Microsoft) |
| Modify | `src/lib/components/app-sidebar.svelte` | Add "Connected Accounts" nav item |
| Modify | `src/routes/(app)/targets/[slug]/+page.svelte` | Show "Managed by" badge, disable editing |
| Modify | `src/routes/(app)/targets/[slug]/+page.server.ts` | Load connected account info for managed targets |
| Modify | `src/lib/server/mcp/tools/bootstrap.ts` | Include integration info for managed targets |
| Modify | `tests/helpers.ts` | Add factory functions for new tables, update `truncateAll` |
| Create | `tests/integration/connected-accounts.test.ts` | Integration tests for the full flow |
| Create | `tests/integration/gateway-managed.test.ts` | Gateway tests for managed target credential resolution |

---

### Task 1: Schema — New tables and columns

**Files:**
- Modify: `src/lib/server/db/schema.ts`

- [ ] **Step 1: Add `integrationProviders` table to schema**

Add after the `tokenVaultPermissions` table (after line 349) in `src/lib/server/db/schema.ts`:

```typescript
export const integrationProviders = pgTable("integration_providers", {
	id: uuid("id").primaryKey().defaultRandom(),
	slug: varchar("slug", { length: 64 }).notNull().unique(),
	name: varchar("name", { length: 255 }).notNull(),
	type: varchar("type", { length: 64 }).notNull(),
	clientId: text("client_id").notNull(),
	clientSecret: text("client_secret").notNull(),
	scopes: text("scopes").notNull(),
	authUrl: text("auth_url").notNull(),
	tokenUrl: text("token_url").notNull(),
	enabled: boolean("enabled").notNull().default(true),
	createdAt: timestamp("created_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});

export type IntegrationProvider = typeof integrationProviders.$inferSelect;
```

- [ ] **Step 2: Add `connectedAccounts` table to schema**

Add after `integrationProviders`:

```typescript
export const connectedAccounts = pgTable("connected_accounts", {
	id: uuid("id").primaryKey().defaultRandom(),
	providerId: uuid("provider_id")
		.notNull()
		.references(() => integrationProviders.id, { onDelete: "cascade" }),
	email: varchar("email", { length: 255 }).notNull(),
	displayName: varchar("display_name", { length: 255 }),
	accessToken: text("access_token").notNull(),
	refreshToken: text("refresh_token").notNull(),
	tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }).notNull(),
	status: varchar("status", { length: 32 })
		.notNull()
		.$type<"connected" | "disconnected" | "error">()
		.default("connected"),
	statusMessage: text("status_message"),
	createdAt: timestamp("created_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});

export type ConnectedAccount = typeof connectedAccounts.$inferSelect;
```

- [ ] **Step 3: Add `connectedAccountId` and `capability` columns to `targets` table**

Modify the `targets` table definition (line 44-59) to add two nullable columns:

```typescript
export const targets = pgTable("targets", {
	id: uuid("id").primaryKey().defaultRandom(),
	name: varchar("name", { length: 255 }).notNull(),
	slug: varchar("slug", { length: 255 }).notNull().unique(),
	type: text("type").notNull().$type<"api" | "ssh" | "email">(),
	baseUrl: text("base_url"),
	config: jsonb("config").$type<SshConfig | EmailConfig>(),
	email: varchar("email", { length: 255 }),
	enabled: boolean("enabled").notNull().default(true),
	connectedAccountId: uuid("connected_account_id").references(
		() => connectedAccounts.id,
		{ onDelete: "cascade" },
	),
	capability: varchar("capability", { length: 32 }).$type<"mail" | "calendar">(),
	createdAt: timestamp("created_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});
```

- [ ] **Step 4: Generate migration**

Run: `npm run db:generate`

Expected: A new migration file `drizzle/0013_*.sql` is created with the new tables and columns.

- [ ] **Step 5: Verify migration content**

Read the generated migration file and confirm it contains:
1. `CREATE TABLE integration_providers` with all columns
2. `CREATE TABLE connected_accounts` with FK to `integration_providers`
3. `ALTER TABLE targets ADD COLUMN connected_account_id` with FK to `connected_accounts` and CASCADE delete
4. `ALTER TABLE targets ADD COLUMN capability`

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/db/schema.ts drizzle/
git commit -m "feat(integrations): add integration_providers, connected_accounts schema and targets FK"
```

---

### Task 2: Integration providers service

**Files:**
- Create: `src/lib/server/services/integration-providers.ts`

- [ ] **Step 1: Write failing test**

Create `tests/integration/integration-providers.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { truncateAll } from "../helpers";

describe("integration-providers", () => {
	beforeEach(async () => {
		await truncateAll();
	});

	it("creates a provider and retrieves it by slug", async () => {
		const { createProvider, getProviderBySlug } = await import(
			"$lib/server/services/integration-providers"
		);
		const provider = await createProvider({
			name: "Microsoft 365",
			type: "microsoft_365",
			clientId: "test-client-id",
			clientSecret: "test-client-secret",
			scopes: "Mail.ReadWrite Mail.Send Calendars.ReadWrite offline_access User.Read",
			authUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
			tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
		});

		expect(provider.slug).toBe("microsoft-365");
		expect(provider.enabled).toBe(true);

		const found = await getProviderBySlug("microsoft-365");
		expect(found).not.toBeNull();
		expect(found!.clientId).toBe("test-client-id");
	});

	it("lists all providers", async () => {
		const { createProvider, listProviders } = await import(
			"$lib/server/services/integration-providers"
		);
		await createProvider({
			name: "Microsoft 365",
			type: "microsoft_365",
			clientId: "id1",
			clientSecret: "secret1",
			scopes: "Mail.ReadWrite",
			authUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
			tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
		});

		const providers = await listProviders();
		expect(providers).toHaveLength(1);
		expect(providers[0].type).toBe("microsoft_365");
	});

	it("updates a provider", async () => {
		const { createProvider, updateProvider, getProviderBySlug } = await import(
			"$lib/server/services/integration-providers"
		);
		const provider = await createProvider({
			name: "Microsoft 365",
			type: "microsoft_365",
			clientId: "old-id",
			clientSecret: "old-secret",
			scopes: "Mail.ReadWrite",
			authUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
			tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
		});

		await updateProvider(provider.id, { clientId: "new-id" });
		const updated = await getProviderBySlug("microsoft-365");
		expect(updated!.clientId).toBe("new-id");
	});

	it("deletes a provider", async () => {
		const { createProvider, deleteProvider, listProviders } = await import(
			"$lib/server/services/integration-providers"
		);
		const provider = await createProvider({
			name: "Microsoft 365",
			type: "microsoft_365",
			clientId: "id",
			clientSecret: "secret",
			scopes: "Mail.ReadWrite",
			authUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
			tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
		});

		await deleteProvider(provider.id);
		const providers = await listProviders();
		expect(providers).toHaveLength(0);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/integration/integration-providers.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the service implementation**

Create `src/lib/server/services/integration-providers.ts`:

```typescript
import { eq } from "drizzle-orm";
import { db } from "../db";
import { integrationProviders } from "../db/schema";

function slugify(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
}

interface CreateProviderInput {
	name: string;
	type: string;
	clientId: string;
	clientSecret: string;
	scopes: string;
	authUrl: string;
	tokenUrl: string;
}

export async function createProvider(input: CreateProviderInput) {
	const slug = slugify(input.name);
	const [provider] = await db
		.insert(integrationProviders)
		.values({
			slug,
			name: input.name,
			type: input.type,
			clientId: input.clientId,
			clientSecret: input.clientSecret,
			scopes: input.scopes,
			authUrl: input.authUrl,
			tokenUrl: input.tokenUrl,
		})
		.returning();
	return provider;
}

export async function listProviders() {
	return db
		.select()
		.from(integrationProviders)
		.orderBy(integrationProviders.createdAt);
}

export async function getProviderById(id: string) {
	const [provider] = await db
		.select()
		.from(integrationProviders)
		.where(eq(integrationProviders.id, id))
		.limit(1);
	return provider ?? null;
}

export async function getProviderBySlug(slug: string) {
	const [provider] = await db
		.select()
		.from(integrationProviders)
		.where(eq(integrationProviders.slug, slug))
		.limit(1);
	return provider ?? null;
}

export async function getEnabledProviders() {
	return db
		.select()
		.from(integrationProviders)
		.where(eq(integrationProviders.enabled, true))
		.orderBy(integrationProviders.createdAt);
}

export async function updateProvider(
	id: string,
	data: Partial<Pick<CreateProviderInput, "clientId" | "clientSecret" | "scopes" | "authUrl" | "tokenUrl"> & { enabled: boolean }>,
) {
	const [updated] = await db
		.update(integrationProviders)
		.set({ ...data, updatedAt: new Date() })
		.where(eq(integrationProviders.id, id))
		.returning();
	return updated ?? null;
}

export async function deleteProvider(id: string) {
	const [deleted] = await db
		.delete(integrationProviders)
		.where(eq(integrationProviders.id, id))
		.returning();
	return deleted ?? null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/integration/integration-providers.test.ts`
Expected: PASS

- [ ] **Step 5: Update test helpers**

In `tests/helpers.ts`, add to imports at line 7:

```typescript
import { tokens, targets, targetAuthMethods, tokenPermissions, users, webhookEndpoints, webhookEvents, skills, memories, wikiPages, vaults, vaultItems, vaultItemFields, tokenVaultPermissions, integrationProviders, connectedAccounts } from "$lib/server/db/schema";
```

Add factory function after `createTestWikiPage`:

```typescript
export async function createTestProvider(
	overrides: {
		name?: string;
		type?: string;
		clientId?: string;
		clientSecret?: string;
		scopes?: string;
	} = {},
) {
	const { createProvider } = await import("$lib/server/services/integration-providers");
	return createProvider({
		name: overrides.name ?? `Provider ${uid()}`,
		type: overrides.type ?? "microsoft_365",
		clientId: overrides.clientId ?? `client-${uid()}`,
		clientSecret: overrides.clientSecret ?? `secret-${uid()}`,
		scopes: overrides.scopes ?? "Mail.ReadWrite Mail.Send Calendars.ReadWrite offline_access User.Read",
		authUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
		tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
	});
}
```

Update `truncateAll` — add at the **beginning** (before wikiPages delete, since connected_accounts → targets cascade):

```typescript
export async function truncateAll() {
	await db.delete(connectedAccounts);
	await db.delete(integrationProviders);
	await db.delete(wikiPages);
	// ... rest unchanged
}
```

- [ ] **Step 6: Run all tests**

Run: `npm test`
Expected: All existing tests still pass

- [ ] **Step 7: Commit**

```bash
git add src/lib/server/services/integration-providers.ts tests/integration/integration-providers.test.ts tests/helpers.ts
git commit -m "feat(integrations): add integration providers service with CRUD"
```

---

### Task 3: Connected accounts service

**Files:**
- Create: `src/lib/server/services/connected-accounts.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/integration/connected-accounts.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { truncateAll, createTestProvider, createTestToken, grantPermission } from "../helpers";

describe("connected-accounts", () => {
	beforeEach(async () => {
		await truncateAll();
	});

	it("provisions managed targets when connecting an account", async () => {
		const { connectAccount, getAccountById } = await import(
			"$lib/server/services/connected-accounts"
		);
		const { listTargets } = await import("$lib/server/services/targets");

		const provider = await createTestProvider();

		const account = await connectAccount({
			providerId: provider.id,
			email: "matthias@deal.nl",
			displayName: "Matthias",
			accessToken: "access-123",
			refreshToken: "refresh-456",
			tokenExpiresAt: new Date(Date.now() + 3600_000),
		});

		expect(account.status).toBe("connected");
		expect(account.email).toBe("matthias@deal.nl");

		// Should have created 2 managed targets
		const allTargets = await listTargets();
		const managed = allTargets.filter((t) => t.connectedAccountId === account.id);
		expect(managed).toHaveLength(2);

		const mailTarget = managed.find((t) => t.capability === "mail");
		const calendarTarget = managed.find((t) => t.capability === "calendar");

		expect(mailTarget).toBeDefined();
		expect(mailTarget!.type).toBe("api");
		expect(mailTarget!.baseUrl).toBe("https://graph.microsoft.com/v1.0");
		expect(mailTarget!.slug).toContain("mail");

		expect(calendarTarget).toBeDefined();
		expect(calendarTarget!.type).toBe("api");
		expect(calendarTarget!.baseUrl).toBe("https://graph.microsoft.com/v1.0");
		expect(calendarTarget!.slug).toContain("calendar");
	});

	it("cascades delete: disconnecting removes managed targets", async () => {
		const { connectAccount, disconnectAccount } = await import(
			"$lib/server/services/connected-accounts"
		);
		const { listTargets } = await import("$lib/server/services/targets");

		const provider = await createTestProvider();
		const account = await connectAccount({
			providerId: provider.id,
			email: "matthias@deal.nl",
			displayName: "Matthias",
			accessToken: "access-123",
			refreshToken: "refresh-456",
			tokenExpiresAt: new Date(Date.now() + 3600_000),
		});

		await disconnectAccount(account.id);

		const allTargets = await listTargets();
		const managed = allTargets.filter((t) => t.connectedAccountId === account.id);
		expect(managed).toHaveLength(0);
	});

	it("lists accounts with their provider info", async () => {
		const { connectAccount, listAccounts } = await import(
			"$lib/server/services/connected-accounts"
		);

		const provider = await createTestProvider({ name: "Microsoft 365" });
		await connectAccount({
			providerId: provider.id,
			email: "matthias@deal.nl",
			displayName: "Matthias",
			accessToken: "access-123",
			refreshToken: "refresh-456",
			tokenExpiresAt: new Date(Date.now() + 3600_000),
		});

		const accounts = await listAccounts();
		expect(accounts).toHaveLength(1);
		expect(accounts[0].email).toBe("matthias@deal.nl");
		expect(accounts[0].provider.name).toBe("Microsoft 365");
	});

	it("refreshes access token when expired", async () => {
		const { connectAccount, getAccessTokenForAccount } = await import(
			"$lib/server/services/connected-accounts"
		);

		const provider = await createTestProvider();
		const account = await connectAccount({
			providerId: provider.id,
			email: "matthias@deal.nl",
			displayName: "Matthias",
			accessToken: "old-access",
			refreshToken: "refresh-456",
			tokenExpiresAt: new Date(Date.now() - 1000), // expired
		});

		// Mock the token endpoint
		const originalFetch = globalThis.fetch;
		globalThis.fetch = async (url: string | URL | Request) => {
			const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
			if (urlStr.includes("oauth2/v2.0/token")) {
				return Response.json({
					access_token: "new-access-token",
					refresh_token: "new-refresh-token",
					expires_in: 3600,
				});
			}
			return originalFetch(url as never);
		};

		try {
			const token = await getAccessTokenForAccount(account.id);
			expect(token).toBe("new-access-token");
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	it("sets status to disconnected on refresh failure", async () => {
		const { connectAccount, getAccessTokenForAccount, getAccountById } = await import(
			"$lib/server/services/connected-accounts"
		);

		const provider = await createTestProvider();
		const account = await connectAccount({
			providerId: provider.id,
			email: "matthias@deal.nl",
			displayName: "Matthias",
			accessToken: "old-access",
			refreshToken: "bad-refresh",
			tokenExpiresAt: new Date(Date.now() - 1000), // expired
		});

		const originalFetch = globalThis.fetch;
		globalThis.fetch = async (url: string | URL | Request) => {
			const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
			if (urlStr.includes("oauth2/v2.0/token")) {
				return new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 });
			}
			return originalFetch(url as never);
		};

		try {
			await expect(getAccessTokenForAccount(account.id)).rejects.toThrow();
			const updated = await getAccountById(account.id);
			expect(updated!.status).toBe("disconnected");
		} finally {
			globalThis.fetch = originalFetch;
		}
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/integration/connected-accounts.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the service implementation**

Create `src/lib/server/services/connected-accounts.ts`:

```typescript
import { eq } from "drizzle-orm";
import { db } from "../db";
import { connectedAccounts, integrationProviders, targets } from "../db/schema";

function slugify(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
}

interface ConnectAccountInput {
	providerId: string;
	email: string;
	displayName?: string;
	accessToken: string;
	refreshToken: string;
	tokenExpiresAt: Date;
}

export async function connectAccount(input: ConnectAccountInput) {
	const provider = await db
		.select()
		.from(integrationProviders)
		.where(eq(integrationProviders.id, input.providerId))
		.limit(1)
		.then((r) => r[0]);

	if (!provider) throw new Error("provider not found");

	// Create connected account
	const [account] = await db
		.insert(connectedAccounts)
		.values({
			providerId: input.providerId,
			email: input.email,
			displayName: input.displayName,
			accessToken: input.accessToken,
			refreshToken: input.refreshToken,
			tokenExpiresAt: input.tokenExpiresAt,
		})
		.returning();

	// Provision managed targets
	const emailSlug = slugify(input.email);

	await db.insert(targets).values([
		{
			name: `${input.email} — Mail`,
			slug: `${emailSlug}-mail`,
			type: "api",
			baseUrl: "https://graph.microsoft.com/v1.0",
			connectedAccountId: account.id,
			capability: "mail",
		},
		{
			name: `${input.email} — Calendar`,
			slug: `${emailSlug}-calendar`,
			type: "api",
			baseUrl: "https://graph.microsoft.com/v1.0",
			connectedAccountId: account.id,
			capability: "calendar",
		},
	]);

	return account;
}

export async function disconnectAccount(accountId: string) {
	// Managed targets are cascade-deleted via FK
	const [deleted] = await db
		.delete(connectedAccounts)
		.where(eq(connectedAccounts.id, accountId))
		.returning();
	return deleted ?? null;
}

export async function getAccountById(accountId: string) {
	const [account] = await db
		.select()
		.from(connectedAccounts)
		.where(eq(connectedAccounts.id, accountId))
		.limit(1);
	return account ?? null;
}

export async function listAccounts() {
	const rows = await db
		.select({
			id: connectedAccounts.id,
			email: connectedAccounts.email,
			displayName: connectedAccounts.displayName,
			status: connectedAccounts.status,
			statusMessage: connectedAccounts.statusMessage,
			createdAt: connectedAccounts.createdAt,
			provider: {
				id: integrationProviders.id,
				name: integrationProviders.name,
				type: integrationProviders.type,
				slug: integrationProviders.slug,
			},
		})
		.from(connectedAccounts)
		.innerJoin(integrationProviders, eq(connectedAccounts.providerId, integrationProviders.id))
		.orderBy(connectedAccounts.createdAt);
	return rows;
}

export async function getManagedTargets(accountId: string) {
	return db
		.select()
		.from(targets)
		.where(eq(targets.connectedAccountId, accountId));
}

export async function getAccessTokenForAccount(accountId: string): Promise<string> {
	const account = await getAccountById(accountId);
	if (!account) throw new Error("account not found");

	// Return cached token if still valid (with 60s buffer)
	if (new Date(account.tokenExpiresAt).getTime() > Date.now() + 60_000) {
		return account.accessToken;
	}

	// Need to refresh
	const provider = await db
		.select()
		.from(integrationProviders)
		.where(eq(integrationProviders.id, account.providerId))
		.limit(1)
		.then((r) => r[0]);

	if (!provider) throw new Error("provider not found");

	const response = await fetch(provider.tokenUrl, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			client_id: provider.clientId,
			client_secret: provider.clientSecret,
			refresh_token: account.refreshToken,
			grant_type: "refresh_token",
		}),
	});

	if (!response.ok) {
		const body = await response.text();
		// Mark account as disconnected
		await db
			.update(connectedAccounts)
			.set({
				status: "disconnected",
				statusMessage: `Token refresh failed (${response.status}): ${body.slice(0, 200)}`,
				updatedAt: new Date(),
			})
			.where(eq(connectedAccounts.id, accountId));
		throw new Error(`OAuth2 token refresh failed (${response.status}): ${body}`);
	}

	const data = await response.json();
	const accessToken = data.access_token as string;
	const expiresIn = (data.expires_in as number) || 3600;
	const newRefreshToken = (data.refresh_token as string) || account.refreshToken;

	await db
		.update(connectedAccounts)
		.set({
			accessToken,
			refreshToken: newRefreshToken,
			tokenExpiresAt: new Date(Date.now() + expiresIn * 1000),
			status: "connected",
			statusMessage: null,
			updatedAt: new Date(),
		})
		.where(eq(connectedAccounts.id, accountId));

	return accessToken;
}

export async function updateAccountStatus(
	accountId: string,
	status: "connected" | "disconnected" | "error",
	message?: string,
) {
	await db
		.update(connectedAccounts)
		.set({
			status,
			statusMessage: message ?? null,
			updatedAt: new Date(),
		})
		.where(eq(connectedAccounts.id, accountId));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/integration/connected-accounts.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/services/connected-accounts.ts tests/integration/connected-accounts.test.ts
git commit -m "feat(integrations): add connected accounts service with provisioning and token refresh"
```

---

### Task 4: Gateway — resolve credentials for managed targets

**Files:**
- Modify: `src/lib/server/services/gateway.ts`

- [ ] **Step 1: Write failing test**

Create `tests/integration/gateway-managed.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { truncateAll, createTestToken, createTestProvider, grantPermission } from "../helpers";

describe("gateway — managed targets", () => {
	let originalFetch: typeof globalThis.fetch;

	beforeEach(async () => {
		await truncateAll();
		originalFetch = globalThis.fetch;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("injects access token from connected account for managed targets", async () => {
		const { connectAccount } = await import("$lib/server/services/connected-accounts");
		const { proxyRequest } = await import("$lib/server/services/gateway");
		const { listTargets } = await import("$lib/server/services/targets");

		const provider = await createTestProvider();
		const token = await createTestToken();
		const account = await connectAccount({
			providerId: provider.id,
			email: "test@example.com",
			accessToken: "my-graph-access-token",
			refreshToken: "my-refresh",
			tokenExpiresAt: new Date(Date.now() + 3600_000),
		});

		const allTargets = await listTargets();
		const mailTarget = allTargets.find(
			(t) => t.connectedAccountId === account.id && t.capability === "mail",
		)!;

		await grantPermission(token.id, mailTarget.id);

		let capturedHeaders: Headers | null = null;
		globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
			capturedHeaders = new Headers(init?.headers);
			return new Response(JSON.stringify({ ok: true }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		};

		const request = new Request("http://localhost/gateway/test-example-com-mail/me/messages", {
			method: "GET",
		});

		const response = await proxyRequest(token, mailTarget.slug, "me/messages", request);

		expect(response.status).toBe(200);
		expect(capturedHeaders!.get("Authorization")).toBe("Bearer my-graph-access-token");
	});

	it("returns error when connected account is disconnected", async () => {
		const { connectAccount, updateAccountStatus } = await import(
			"$lib/server/services/connected-accounts"
		);
		const { proxyRequest } = await import("$lib/server/services/gateway");
		const { listTargets } = await import("$lib/server/services/targets");

		const provider = await createTestProvider();
		const token = await createTestToken();
		const account = await connectAccount({
			providerId: provider.id,
			email: "test@example.com",
			accessToken: "old-token",
			refreshToken: "old-refresh",
			tokenExpiresAt: new Date(Date.now() + 3600_000),
		});

		await updateAccountStatus(account.id, "disconnected", "Token revoked");

		const allTargets = await listTargets();
		const mailTarget = allTargets.find(
			(t) => t.connectedAccountId === account.id && t.capability === "mail",
		)!;

		await grantPermission(token.id, mailTarget.id);

		const request = new Request("http://localhost/gateway/test-example-com-mail/me/messages", {
			method: "GET",
		});

		const response = await proxyRequest(token, mailTarget.slug, "me/messages", request);

		expect(response.status).toBe(503);
		const body = await response.json();
		expect(body.error).toContain("disconnected");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/integration/gateway-managed.test.ts`
Expected: FAIL — gateway doesn't handle managed targets yet

- [ ] **Step 3: Modify gateway to resolve managed target credentials**

In `src/lib/server/services/gateway.ts`, add import at line 8:

```typescript
import { getAccessTokenForAccount } from "./connected-accounts";
import { connectedAccounts } from "../db/schema";
```

In `proxyToTarget`, after the auth method injection block (after line 229, before the upstream body buffering at line 232), add managed target credential injection. Replace the entire credential injection section (lines 107-229) with:

```typescript
	// Inject credentials: managed target (connected account) or default auth method
	if (target.connectedAccountId) {
		// Managed target — get credentials from connected account
		const [account] = await db
			.select()
			.from(connectedAccounts)
			.where(eq(connectedAccounts.id, target.connectedAccountId))
			.limit(1);

		if (!account) {
			return Response.json({ error: "connected account not found" }, { status: 500 });
		}

		if (account.status === "disconnected" || account.status === "error") {
			return Response.json(
				{ error: `connected account is ${account.status}: ${account.statusMessage ?? "re-authentication required"}` },
				{ status: 503 },
			);
		}

		try {
			const accessToken = await getAccessTokenForAccount(target.connectedAccountId);
			headers.set("Authorization", `Bearer ${accessToken}`);
		} catch (err) {
			console.error("[gateway] ✗ managed target token refresh failed:", err);
			return Response.json(
				{ error: "connected account token refresh failed, re-authentication required" },
				{ status: 503 },
			);
		}
	} else {
		// Standard auth method flow (existing code)
		const authMethod = await getDefaultAuthMethod(target.id);
		if (authMethod) {
			// ... (existing auth method injection code, lines 110-229, unchanged)
		}
	}
```

Also add `db` and `eq` imports if not present, and import `connectedAccounts` from schema.

The full modified section wraps the existing `authMethod` block inside an `else` clause of the new `if (target.connectedAccountId)` check. All existing auth method code (bearer, basic, custom_header, query_param, jwt_es256, oauth2_refresh_token, json_body) remains unchanged inside the `else`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/integration/gateway-managed.test.ts`
Expected: PASS

- [ ] **Step 5: Run all tests to verify no regressions**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/services/gateway.ts tests/integration/gateway-managed.test.ts
git commit -m "feat(integrations): gateway resolves credentials from connected account for managed targets"
```

---

### Task 5: Protect managed targets from direct mutation

**Files:**
- Modify: `src/lib/server/services/targets.ts`

- [ ] **Step 1: Write failing test**

Add to `tests/integration/connected-accounts.test.ts`:

```typescript
	it("rejects updates to managed target details", async () => {
		const { connectAccount } = await import("$lib/server/services/connected-accounts");
		const { updateTarget, listTargets } = await import("$lib/server/services/targets");

		const provider = await createTestProvider();
		const account = await connectAccount({
			providerId: provider.id,
			email: "managed@example.com",
			displayName: "Managed",
			accessToken: "access-123",
			refreshToken: "refresh-456",
			tokenExpiresAt: new Date(Date.now() + 3600_000),
		});

		const allTargets = await listTargets();
		const managedTarget = allTargets.find((t) => t.connectedAccountId === account.id)!;

		const result = await updateTarget(managedTarget.slug, { name: "hacked" });
		expect(result).toHaveProperty("error");
	});

	it("allows permission changes on managed targets", async () => {
		const { connectAccount } = await import("$lib/server/services/connected-accounts");
		const { listTargets } = await import("$lib/server/services/targets");
		const { addPermission, hasPermission } = await import("$lib/server/services/permissions");

		const provider = await createTestProvider();
		const token = await createTestToken();
		const account = await connectAccount({
			providerId: provider.id,
			email: "perm@example.com",
			displayName: "Perm Test",
			accessToken: "access-123",
			refreshToken: "refresh-456",
			tokenExpiresAt: new Date(Date.now() + 3600_000),
		});

		const allTargets = await listTargets();
		const managedTarget = allTargets.find((t) => t.connectedAccountId === account.id)!;

		await addPermission(token.id, managedTarget.id);
		const permitted = await hasPermission(token.id, managedTarget.id);
		expect(permitted).toBe(true);
	});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/integration/connected-accounts.test.ts`
Expected: FAIL on the "rejects updates" test (currently allows mutation)

- [ ] **Step 3: Add managed target guard to `updateTarget`**

In `src/lib/server/services/targets.ts`, at the start of the `updateTarget` function (around line 152), add a check:

```typescript
export async function updateTarget(slug: string, data: UpdateTargetInput) {
	const [existing] = await db
		.select()
		.from(targets)
		.where(eq(targets.slug, slug))
		.limit(1);

	if (!existing) return { error: "target not found" };

	// Block mutations on managed targets
	if (existing.connectedAccountId) {
		return { error: "cannot modify a managed target — changes must be made via the connected account" };
	}

	// ... rest of existing updateTarget code
```

Similarly, add to `deleteTarget`:

```typescript
export async function deleteTarget(slug: string) {
	const [existing] = await db
		.select()
		.from(targets)
		.where(eq(targets.slug, slug))
		.limit(1);

	if (!existing) return { error: "target not found" };

	if (existing.connectedAccountId) {
		return { error: "cannot delete a managed target — disconnect the account instead" };
	}

	// ... rest of existing deleteTarget code
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/integration/connected-accounts.test.ts`
Expected: PASS

- [ ] **Step 5: Run all tests**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/services/targets.ts tests/integration/connected-accounts.test.ts
git commit -m "feat(integrations): block direct mutation of managed targets"
```

---

### Task 6: OAuth flow routes

**Files:**
- Create: `src/routes/oauth/authorize/+server.ts`
- Create: `src/routes/oauth/callback/+server.ts`
- Modify: `src/hooks.server.ts`

- [ ] **Step 1: Add OAuth routes to hooks bypass**

In `src/hooks.server.ts`, add `pathname.startsWith("/oauth/")` to the bypass block (line 27-43):

```typescript
	if (
		pathname.startsWith("/api/") ||
		pathname.startsWith("/gateway/") ||
		pathname.startsWith("/ssh/") ||
		pathname.startsWith("/mail/") ||
		pathname.startsWith("/discovery") ||
		pathname.startsWith("/bootstrap") ||
		pathname.startsWith("/webhooks/") ||
		pathname.startsWith("/mcp") ||
		pathname.startsWith("/verify-connection") ||
		pathname.startsWith("/health") ||
		pathname.startsWith("/_app/") ||
		pathname === "/favicon.ico"
	) {
```

Wait — OAuth routes should NOT bypass auth. They need session auth (dashboard user must be logged in to connect). Keep as-is — the routes will be under `(app)` group or we handle session check in the route handlers.

Actually, the OAuth callback is a redirect from Microsoft — the user's browser hits it after consent. The user is already logged in (has session cookie). So it should go through normal auth. No change needed to hooks.

- [ ] **Step 2: Create the authorize route**

Create `src/routes/oauth/authorize/+server.ts`:

```typescript
import { redirect } from "@sveltejs/kit";
import { randomBytes } from "node:crypto";
import { getProviderById } from "$lib/server/services/integration-providers";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ url, cookies }) => {
	const providerId = url.searchParams.get("provider");
	if (!providerId) {
		return Response.json({ error: "provider parameter required" }, { status: 400 });
	}

	const provider = await getProviderById(providerId);
	if (!provider || !provider.enabled) {
		return Response.json({ error: "provider not found or disabled" }, { status: 404 });
	}

	const state = randomBytes(32).toString("hex");
	cookies.set("oauth_state", JSON.stringify({ state, providerId }), {
		path: "/",
		httpOnly: true,
		sameSite: "lax",
		maxAge: 600, // 10 minutes
	});

	const redirectUri = `${url.origin}/oauth/callback`;

	const authUrl = new URL(provider.authUrl);
	authUrl.searchParams.set("client_id", provider.clientId);
	authUrl.searchParams.set("response_type", "code");
	authUrl.searchParams.set("redirect_uri", redirectUri);
	authUrl.searchParams.set("scope", provider.scopes);
	authUrl.searchParams.set("state", state);
	authUrl.searchParams.set("response_mode", "query");
	authUrl.searchParams.set("prompt", "consent");

	redirect(302, authUrl.toString());
};
```

- [ ] **Step 3: Create the callback route**

Create `src/routes/oauth/callback/+server.ts`:

```typescript
import { redirect } from "@sveltejs/kit";
import { getProviderById } from "$lib/server/services/integration-providers";
import { connectAccount } from "$lib/server/services/connected-accounts";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ url, cookies }) => {
	const code = url.searchParams.get("code");
	const state = url.searchParams.get("state");
	const error = url.searchParams.get("error");

	if (error) {
		redirect(303, `/integrations?error=${encodeURIComponent(error)}`);
	}

	if (!code || !state) {
		redirect(303, "/integrations?error=missing_params");
	}

	// Validate state
	const stateCookie = cookies.get("oauth_state");
	if (!stateCookie) {
		redirect(303, "/integrations?error=invalid_state");
	}

	let storedState: { state: string; providerId: string };
	try {
		storedState = JSON.parse(stateCookie);
	} catch {
		redirect(303, "/integrations?error=invalid_state");
	}

	if (storedState.state !== state) {
		redirect(303, "/integrations?error=invalid_state");
	}

	cookies.delete("oauth_state", { path: "/" });

	const provider = await getProviderById(storedState.providerId);
	if (!provider) {
		redirect(303, "/integrations?error=provider_not_found");
	}

	// Exchange code for tokens
	const redirectUri = `${url.origin}/oauth/callback`;

	const tokenResponse = await fetch(provider.tokenUrl, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			client_id: provider.clientId,
			client_secret: provider.clientSecret,
			code,
			redirect_uri: redirectUri,
			grant_type: "authorization_code",
		}),
	});

	if (!tokenResponse.ok) {
		const body = await tokenResponse.text();
		console.error("[oauth] token exchange failed:", body);
		redirect(303, "/integrations?error=token_exchange_failed");
	}

	const tokenData = await tokenResponse.json();
	const accessToken = tokenData.access_token as string;
	const refreshToken = tokenData.refresh_token as string;
	const expiresIn = (tokenData.expires_in as number) || 3600;

	// Fetch user profile from Graph API to get email
	const profileResponse = await fetch("https://graph.microsoft.com/v1.0/me", {
		headers: { Authorization: `Bearer ${accessToken}` },
	});

	let email = "unknown";
	let displayName: string | undefined;

	if (profileResponse.ok) {
		const profile = await profileResponse.json();
		email = profile.mail || profile.userPrincipalName || "unknown";
		displayName = profile.displayName;
	}

	await connectAccount({
		providerId: provider.id,
		email,
		displayName,
		accessToken,
		refreshToken,
		tokenExpiresAt: new Date(Date.now() + expiresIn * 1000),
	});

	redirect(303, "/integrations?success=connected");
};
```

- [ ] **Step 4: Commit**

```bash
git add src/routes/oauth/
git commit -m "feat(integrations): add OAuth authorize and callback routes"
```

---

### Task 7: Settings UI — provider configuration

**Files:**
- Modify: `src/routes/(app)/settings/+page.svelte`
- Modify: `src/routes/(app)/settings/+page.server.ts`

- [ ] **Step 1: Add server-side load and actions**

Replace `src/routes/(app)/settings/+page.server.ts` with:

```typescript
import { redirect, fail } from "@sveltejs/kit";
import { sql } from "drizzle-orm";
import { db } from "$lib/server/db";
import { runMigrations } from "$lib/server/migrate";
import { listProviders, createProvider, updateProvider, deleteProvider } from "$lib/server/services/integration-providers";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async () => {
	const providers = await listProviders();
	return { providers };
};

export const actions = {
	resetDatabase: async ({ cookies }) => {
		await db.execute(sql`DROP SCHEMA public CASCADE`);
		await db.execute(sql`CREATE SCHEMA public`);
		await db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);

		await runMigrations();

		cookies.set("session", "", { path: "/", maxAge: 0 });
		redirect(303, "/setup");
	},

	createProvider: async ({ request }) => {
		const form = await request.formData();
		const name = form.get("name") as string;
		const type = form.get("type") as string;
		const clientId = form.get("clientId") as string;
		const clientSecret = form.get("clientSecret") as string;
		const scopes = form.get("scopes") as string;
		const authUrl = form.get("authUrl") as string;
		const tokenUrl = form.get("tokenUrl") as string;

		if (!name || !type || !clientId || !clientSecret || !scopes || !authUrl || !tokenUrl) {
			return fail(400, { error: "All fields are required" });
		}

		await createProvider({ name, type, clientId, clientSecret, scopes, authUrl, tokenUrl });
		return { success: true };
	},

	updateProvider: async ({ request }) => {
		const form = await request.formData();
		const id = form.get("id") as string;
		const clientId = form.get("clientId") as string;
		const clientSecret = form.get("clientSecret") as string;
		const scopes = form.get("scopes") as string;

		if (!id) return fail(400, { error: "Provider ID required" });

		const data: Record<string, string> = {};
		if (clientId) data.clientId = clientId;
		if (clientSecret) data.clientSecret = clientSecret;
		if (scopes) data.scopes = scopes;

		await updateProvider(id, data);
		return { success: true };
	},

	deleteProvider: async ({ request }) => {
		const form = await request.formData();
		const id = form.get("id") as string;
		if (!id) return fail(400, { error: "Provider ID required" });

		await deleteProvider(id);
		return { success: true };
	},
} satisfies Actions;
```

- [ ] **Step 2: Update settings page UI**

In `src/routes/(app)/settings/+page.svelte`, add the provider configuration section. Add this before the Danger Zone card. The full file should include:

1. A data prop: `let { data } = $props();`
2. State for the "Add Provider" dialog
3. A "Integration Providers" card that lists configured providers
4. Each provider shows name, type, client ID (masked), with edit/delete actions
5. An "Add Provider" dialog with a form pre-filled with Microsoft 365 defaults

The key form fields for adding a Microsoft 365 provider:
- Name: "Microsoft 365" (preset)
- Type: "microsoft_365" (preset)
- Client ID: text input
- Client Secret: password input
- Scopes: "Mail.ReadWrite Mail.Send Calendars.ReadWrite offline_access User.Read" (preset)
- Auth URL: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize" (preset)
- Token URL: "https://login.microsoftonline.com/common/oauth2/v2.0/token" (preset)

Use the same component patterns as the rest of the dashboard (Card, Dialog, Button, Input from shadcn-svelte, `use:enhance` for forms).

- [ ] **Step 3: Verify dev server loads**

Run: `npm run dev` and navigate to `/settings`
Expected: Settings page shows provider configuration section + existing danger zone

- [ ] **Step 4: Commit**

```bash
git add src/routes/\(app\)/settings/
git commit -m "feat(integrations): add OAuth provider configuration to settings page"
```

---

### Task 8: Integrations dashboard page

**Files:**
- Create: `src/routes/(app)/integrations/+page.svelte`
- Create: `src/routes/(app)/integrations/+page.server.ts`
- Modify: `src/lib/components/app-sidebar.svelte`

- [ ] **Step 1: Add sidebar navigation item**

In `src/lib/components/app-sidebar.svelte`, add "Connected Accounts" to the Integrations group (line 28):

```typescript
		{
			title: "Integrations",
			items: [
				{ title: "Connected Accounts", url: "/integrations" },
				{ title: "Connect Agent", url: "/connect" },
			],
		},
```

- [ ] **Step 2: Create page server**

Create `src/routes/(app)/integrations/+page.server.ts`:

```typescript
import { fail } from "@sveltejs/kit";
import { listAccounts, disconnectAccount, getManagedTargets } from "$lib/server/services/connected-accounts";
import { getEnabledProviders } from "$lib/server/services/integration-providers";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async () => {
	const accounts = await listAccounts();
	const providers = await getEnabledProviders();

	// Load managed targets for each account
	const accountsWithTargets = await Promise.all(
		accounts.map(async (account) => {
			const managedTargets = await getManagedTargets(account.id);
			return { ...account, managedTargets };
		}),
	);

	return { accounts: accountsWithTargets, providers };
};

export const actions = {
	disconnect: async ({ request }) => {
		const form = await request.formData();
		const accountId = form.get("accountId") as string;
		if (!accountId) return fail(400, { error: "Account ID required" });

		await disconnectAccount(accountId);
		return { success: true };
	},
} satisfies Actions;
```

- [ ] **Step 3: Create the page component**

Create `src/routes/(app)/integrations/+page.svelte`:

```svelte
<script lang="ts">
	import { enhance } from "$app/forms";
	import * as Breadcrumb from "$lib/components/ui/breadcrumb/index.js";
	import * as Card from "$lib/components/ui/card/index.js";
	import * as Dialog from "$lib/components/ui/dialog/index.js";
	import { Button } from "$lib/components/ui/button/index.js";
	import { Badge } from "$lib/components/ui/badge/index.js";
	import LinkIcon from "@lucide/svelte/icons/link";
	import UnlinkIcon from "@lucide/svelte/icons/unlink";
	import CircleCheckIcon from "@lucide/svelte/icons/circle-check";
	import CircleXIcon from "@lucide/svelte/icons/circle-x";

	let { data } = $props();
	let disconnectDialogOpen = $state(false);
	let disconnectAccountId = $state("");
	let disconnectEmail = $state("");
</script>

<div class="flex flex-col gap-6">
	<div>
		<Breadcrumb.Root>
			<Breadcrumb.List>
				<Breadcrumb.Item>
					<Breadcrumb.Link href="/">Shellgate</Breadcrumb.Link>
				</Breadcrumb.Item>
				<Breadcrumb.Separator />
				<Breadcrumb.Item>
					<Breadcrumb.Page>Connected Accounts</Breadcrumb.Page>
				</Breadcrumb.Item>
			</Breadcrumb.List>
		</Breadcrumb.Root>
		<h1 class="mt-1 text-2xl font-bold tracking-tight">Connected Accounts</h1>
		<p class="text-sm text-muted-foreground">
			Connect external accounts to automatically provision mail and calendar targets.
		</p>
	</div>

	{#if data.providers.length > 0}
		<Card.Root>
			<Card.Header>
				<Card.Title>Connect a provider</Card.Title>
			</Card.Header>
			<Card.Content>
				<div class="flex gap-2">
					{#each data.providers as provider}
						<Button href="/oauth/authorize?provider={provider.id}">
							<LinkIcon class="mr-2 size-4" />
							Connect {provider.name}
						</Button>
					{/each}
				</div>
			</Card.Content>
		</Card.Root>
	{:else}
		<Card.Root>
			<Card.Content class="py-6">
				<p class="text-sm text-muted-foreground">
					No providers configured. Go to <a href="/settings" class="underline">Settings</a> to add an OAuth provider first.
				</p>
			</Card.Content>
		</Card.Root>
	{/if}

	{#if data.accounts.length > 0}
		<div class="flex flex-col gap-4">
			{#each data.accounts as account}
				<Card.Root>
					<Card.Header>
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-3">
								<div>
									<Card.Title class="flex items-center gap-2">
										{account.email}
										{#if account.status === "connected"}
											<Badge variant="default" class="bg-green-600">
												<CircleCheckIcon class="mr-1 size-3" />
												Connected
											</Badge>
										{:else}
											<Badge variant="destructive">
												<CircleXIcon class="mr-1 size-3" />
												{account.status}
											</Badge>
										{/if}
									</Card.Title>
									<Card.Description>
										{account.provider.name}
										{#if account.displayName} &middot; {account.displayName}{/if}
									</Card.Description>
								</div>
							</div>
							<Button
								variant="outline"
								size="sm"
								onclick={() => {
									disconnectAccountId = account.id;
									disconnectEmail = account.email;
									disconnectDialogOpen = true;
								}}
							>
								<UnlinkIcon class="mr-2 size-4" />
								Disconnect
							</Button>
						</div>
					</Card.Header>
					<Card.Content>
						{#if account.statusMessage}
							<p class="mb-3 text-sm text-destructive">{account.statusMessage}</p>
						{/if}
						<div class="flex gap-2">
							{#each account.managedTargets as target}
								<a href="/targets/{target.slug}">
									<Badge variant="outline">
										{target.capability} &middot; {target.slug}
									</Badge>
								</a>
							{/each}
						</div>
					</Card.Content>
				</Card.Root>
			{/each}
		</div>
	{/if}
</div>

<Dialog.Root bind:open={disconnectDialogOpen}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Disconnect Account</Dialog.Title>
			<Dialog.Description>
				This will remove the connected account <strong>{disconnectEmail}</strong> and delete all managed targets.
				Any agent permissions to these targets will also be removed. This cannot be undone.
			</Dialog.Description>
		</Dialog.Header>
		<form
			method="POST"
			action="?/disconnect"
			use:enhance={() => {
				return async ({ update }) => {
					disconnectDialogOpen = false;
					await update();
				};
			}}
		>
			<input type="hidden" name="accountId" value={disconnectAccountId} />
			<Dialog.Footer>
				<Dialog.Close>
					{#snippet child({ props })}
						<Button variant="outline" {...props}>Cancel</Button>
					{/snippet}
				</Dialog.Close>
				<Button type="submit" variant="destructive">Disconnect</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
```

- [ ] **Step 4: Verify dev server loads**

Run: `npm run dev` and navigate to `/integrations`
Expected: Page shows connect button (if provider configured) and list of accounts

- [ ] **Step 5: Commit**

```bash
git add src/routes/\(app\)/integrations/ src/lib/components/app-sidebar.svelte
git commit -m "feat(integrations): add Connected Accounts dashboard page"
```

---

### Task 9: Target detail — managed badge and read-only mode

**Files:**
- Modify: `src/routes/(app)/targets/[slug]/+page.server.ts`
- Modify: `src/routes/(app)/targets/[slug]/+page.svelte`

- [ ] **Step 1: Add connected account info to page load**

In `src/routes/(app)/targets/[slug]/+page.server.ts`, if the target has a `connectedAccountId`, load the account info:

```typescript
import { getAccountById } from "$lib/server/services/connected-accounts";

// In the load function, after loading the target:
const connectedAccount = target.connectedAccountId
	? await getAccountById(target.connectedAccountId)
	: null;

// Return it alongside existing data:
return { target, authMethods, tokenAccess, availableTokens, connectedAccount };
```

- [ ] **Step 2: Add managed badge and disable editing in the UI**

In `src/routes/(app)/targets/[slug]/+page.svelte`, add:

1. A "Managed by [integration]" badge next to the target name when `data.connectedAccount` is set
2. Hide or disable the edit name, edit base URL, edit config, add/edit auth method, and delete target actions when `data.connectedAccount` is set
3. Keep the token access/permission section fully functional

The badge can use:
```svelte
{#if data.connectedAccount}
	<Badge variant="outline">
		Managed by {data.connectedAccount.email}
	</Badge>
{/if}
```

And wrap edit actions in `{#if !data.connectedAccount}` blocks.

- [ ] **Step 3: Verify in dev server**

Navigate to a managed target's detail page.
Expected: Shows "Managed by" badge, editing controls hidden, permission controls visible.

- [ ] **Step 4: Commit**

```bash
git add src/routes/\(app\)/targets/\[slug\]/
git commit -m "feat(integrations): show managed badge and disable editing for managed targets"
```

---

### Task 10: Bootstrap — include integration info for managed targets

**Files:**
- Modify: `src/lib/server/mcp/tools/bootstrap.ts`

- [ ] **Step 1: Update bootstrap to include integration context**

In `src/lib/server/mcp/tools/bootstrap.ts`, modify the target mapping (lines 13-30) to include integration info for managed targets:

```typescript
import { getAccountById } from "$lib/server/services/connected-accounts";

// In the target mapping:
const targets = (
	await Promise.all(
		permissions.map(async (p) => {
			const target = await getTargetById(p.targetId);
			if (!target || !target.enabled) return null;

			let integration: { email: string; capability: string } | undefined;
			if (target.connectedAccountId && target.capability) {
				const account = await getAccountById(target.connectedAccountId);
				if (account) {
					integration = { email: account.email, capability: target.capability };
				}
			}

			return {
				slug: target.slug,
				name: target.name,
				type: target.type,
				...(target.type === "api" && {
					proxy: `/gateway/${target.slug}`,
					baseUrl: target.baseUrl,
				}),
				...(target.type === "email" && {
					email: target.email,
				}),
				...(integration && { integration }),
			};
		}),
	)
).filter(Boolean);
```

This way agents can see which targets belong to an integration and what capability they represent, making it clearer that e.g. `matthias-deal-nl-mail` is a Graph API mail target for `matthias@deal.nl`.

- [ ] **Step 2: Run all tests**

Run: `npm test`
Expected: All tests pass (bootstrap test should still pass as integration is optional)

- [ ] **Step 3: Commit**

```bash
git add src/lib/server/mcp/tools/bootstrap.ts
git commit -m "feat(integrations): include integration context in bootstrap response for managed targets"
```

---

### Task 11: Final — run full test suite and typecheck

- [ ] **Step 1: Run typecheck**

Run: `npm run check`
Expected: No TypeScript errors

- [ ] **Step 2: Run full test suite**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 3: Fix any issues found**

Address any type errors or test failures.

- [ ] **Step 4: Final commit if fixes needed**

```bash
git add -A
git commit -m "fix(integrations): address typecheck and test issues"
```
