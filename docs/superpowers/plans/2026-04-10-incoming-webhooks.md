# Incoming Webhooks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow external services (Linear, GitHub, etc.) to push webhooks to Shellgate, where agents poll and acknowledge them.

**Architecture:** Two new tables (`webhook_endpoints`, `webhook_events`) with services for CRUD, receiving, polling, and acknowledging. Public incoming route, bearer-auth poll/ack routes, dashboard pages for management.

**Tech Stack:** SvelteKit, Drizzle ORM, PostgreSQL, Vitest + Testcontainers, shadcn-svelte

**Spec:** `docs/superpowers/specs/2026-04-10-incoming-webhooks-design.md`

---

## File Structure

### New files

| File | Responsibility |
|---|---|
| `src/lib/server/services/webhook-endpoints.ts` | CRUD for webhook endpoint registrations |
| `src/lib/server/services/webhook-events.ts` | Event creation, polling, ACK, cleanup |
| `src/lib/server/utils/hmac.ts` | HMAC signature verification |
| `src/routes/webhooks/incoming/[slug]/+server.ts` | Public: receive webhook payloads |
| `src/routes/webhooks/poll/+server.ts` | Agent-facing: poll pending events |
| `src/routes/webhooks/ack/+server.ts` | Agent-facing: acknowledge events |
| `src/routes/api/webhook-endpoints/+server.ts` | Admin API: list + create endpoints |
| `src/routes/api/webhook-endpoints/[id]/+server.ts` | Admin API: get + delete endpoint |
| `src/routes/api/webhook-events/+server.ts` | Admin API: list events |
| `src/routes/api/webhook-events/cleanup/+server.ts` | Admin API: cleanup expired |
| `src/routes/(app)/webhooks/+page.server.ts` | Dashboard: list + create + delete actions |
| `src/routes/(app)/webhooks/+page.svelte` | Dashboard: webhook endpoints list page |
| `src/routes/(app)/webhooks/[id]/+page.server.ts` | Dashboard: endpoint detail + events |
| `src/routes/(app)/webhooks/[id]/+page.svelte` | Dashboard: endpoint detail page |
| `tests/unit/hmac.test.ts` | Unit test: HMAC verification |
| `tests/integration/webhook-endpoints.test.ts` | Integration test: endpoint CRUD + cascade |
| `tests/integration/webhook-events.test.ts` | Integration test: receive, poll, ACK, cleanup |

### Modified files

| File | Change |
|---|---|
| `src/lib/server/db/schema.ts` | Add `webhookEndpoints` + `webhookEvents` tables |
| `src/hooks.server.ts` | Bypass auth for `/webhooks/` routes |
| `src/lib/components/app-sidebar.svelte` | Add "Webhooks" nav item |
| `tests/helpers.ts` | Add `createTestWebhookEndpoint` + truncate new tables |

---

## Task 1: Database Schema

**Files:**
- Modify: `src/lib/server/db/schema.ts`

- [ ] **Step 1: Add `webhookEndpoints` table to schema**

Add after the `auditLogs` table definition in `src/lib/server/db/schema.ts`:

```ts
export const webhookEndpoints = pgTable("webhook_endpoints", {
	id: uuid("id").primaryKey().defaultRandom(),
	tokenId: uuid("token_id")
		.notNull()
		.references(() => tokens.id, { onDelete: "cascade" }),
	slug: varchar("slug", { length: 255 }).notNull().unique(),
	name: varchar("name", { length: 255 }).notNull(),
	secret: text("secret"),
	signatureHeader: text("signature_header"),
	enabled: boolean("enabled").notNull().default(true),
	createdAt: timestamp("created_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});

export type WebhookEndpoint = typeof webhookEndpoints.$inferSelect;

export const webhookEvents = pgTable(
	"webhook_events",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		endpointId: uuid("endpoint_id")
			.notNull()
			.references(() => webhookEndpoints.id, { onDelete: "cascade" }),
		headers: jsonb("headers").$type<Record<string, string>>().notNull(),
		body: jsonb("body").notNull(),
		status: text("status").notNull().$type<"pending" | "delivered" | "expired">().default("pending"),
		receivedAt: timestamp("received_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		deliveredAt: timestamp("delivered_at", { withTimezone: true }),
		expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
	},
	(t) => [
		index("webhook_events_endpoint_status_idx").on(t.endpointId, t.status),
		index("webhook_events_expires_at_idx").on(t.expiresAt),
	],
);

export type WebhookEvent = typeof webhookEvents.$inferSelect;
```

- [ ] **Step 2: Push schema to dev database**

Run: `npx drizzle-kit push --force`
Expected: Tables `webhook_endpoints` and `webhook_events` created successfully.

- [ ] **Step 3: Commit**

```bash
git add src/lib/server/db/schema.ts
git commit -m "feat: add webhook_endpoints and webhook_events tables"
```

---

## Task 2: HMAC Signature Verification Utility

**Files:**
- Create: `src/lib/server/utils/hmac.ts`
- Create: `tests/unit/hmac.test.ts`

- [ ] **Step 1: Write failing tests for HMAC verification**

Create `tests/unit/hmac.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { verifySignature } from "$lib/server/utils/hmac";
import { createHmac } from "node:crypto";

describe("verifySignature", () => {
	const secret = "test-secret-key";
	const body = '{"action":"create","data":{}}';

	it("returns true for valid HMAC-SHA256 signature", () => {
		const expected = createHmac("sha256", secret).update(body).digest("hex");
		expect(verifySignature(secret, body, expected)).toBe(true);
	});

	it("returns false for invalid signature", () => {
		expect(verifySignature(secret, body, "invalid-signature")).toBe(false);
	});

	it("returns true when signature has sha256= prefix", () => {
		const hash = createHmac("sha256", secret).update(body).digest("hex");
		expect(verifySignature(secret, body, `sha256=${hash}`)).toBe(true);
	});

	it("is timing-safe (does not throw on length mismatch)", () => {
		expect(verifySignature(secret, body, "short")).toBe(false);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/hmac.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement HMAC verification**

Create `src/lib/server/utils/hmac.ts`:

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

export function verifySignature(secret: string, body: string, signature: string): boolean {
	const expected = createHmac("sha256", secret).update(body).digest("hex");

	// Strip common prefixes like "sha256="
	const cleaned = signature.replace(/^sha256=/, "");

	if (cleaned.length !== expected.length) return false;

	return timingSafeEqual(Buffer.from(cleaned, "hex"), Buffer.from(expected, "hex"));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/hmac.test.ts`
Expected: All 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/utils/hmac.ts tests/unit/hmac.test.ts
git commit -m "feat: add HMAC-SHA256 signature verification utility"
```

---

## Task 3: Webhook Endpoints Service

**Files:**
- Create: `src/lib/server/services/webhook-endpoints.ts`
- Modify: `tests/helpers.ts`
- Create: `tests/integration/webhook-endpoints.test.ts`

- [ ] **Step 1: Write failing integration tests**

Create `tests/integration/webhook-endpoints.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import {
	createEndpoint,
	listEndpoints,
	getEndpoint,
	getEndpointBySlug,
	deleteEndpoint,
} from "$lib/server/services/webhook-endpoints";
import { createTestToken, truncateAll } from "../helpers";

describe("webhook-endpoints service", () => {
	beforeEach(async () => {
		await truncateAll();
	});

	it("creates an endpoint with auto-generated slug", async () => {
		const { token } = await createTestToken();
		const endpoint = await createEndpoint(token.id, { name: "Linear webhook" });

		expect(endpoint.id).toBeDefined();
		expect(endpoint.name).toBe("Linear webhook");
		expect(endpoint.slug).toMatch(/^wh_[a-f0-9]{48}$/);
		expect(endpoint.tokenId).toBe(token.id);
		expect(endpoint.enabled).toBe(true);
		expect(endpoint.secret).toBeNull();
		expect(endpoint.signatureHeader).toBeNull();
	});

	it("creates an endpoint with secret and signature header", async () => {
		const { token } = await createTestToken();
		const endpoint = await createEndpoint(token.id, {
			name: "GitHub webhook",
			secret: "gh-secret-123",
			signatureHeader: "X-Hub-Signature-256",
		});

		expect(endpoint.secret).toBe("gh-secret-123");
		expect(endpoint.signatureHeader).toBe("X-Hub-Signature-256");
	});

	it("lists endpoints filtered by tokenId", async () => {
		const { token: token1 } = await createTestToken("Agent A");
		const { token: token2 } = await createTestToken("Agent B");
		await createEndpoint(token1.id, { name: "WH 1" });
		await createEndpoint(token1.id, { name: "WH 2" });
		await createEndpoint(token2.id, { name: "WH 3" });

		const all = await listEndpoints();
		expect(all).toHaveLength(3);

		const filtered = await listEndpoints(token1.id);
		expect(filtered).toHaveLength(2);
		expect(filtered.every((e) => e.tokenId === token1.id)).toBe(true);
	});

	it("gets endpoint by id", async () => {
		const { token } = await createTestToken();
		const created = await createEndpoint(token.id, { name: "Test" });
		const fetched = await getEndpoint(created.id);

		expect(fetched).not.toBeNull();
		expect(fetched!.id).toBe(created.id);
	});

	it("gets endpoint by slug", async () => {
		const { token } = await createTestToken();
		const created = await createEndpoint(token.id, { name: "Test" });
		const fetched = await getEndpointBySlug(created.slug);

		expect(fetched).not.toBeNull();
		expect(fetched!.id).toBe(created.id);
	});

	it("returns null for non-existent endpoint", async () => {
		const fetched = await getEndpoint("00000000-0000-0000-0000-000000000000");
		expect(fetched).toBeNull();
	});

	it("deletes endpoint", async () => {
		const { token } = await createTestToken();
		const created = await createEndpoint(token.id, { name: "Test" });
		await deleteEndpoint(created.id);
		const fetched = await getEndpoint(created.id);
		expect(fetched).toBeNull();
	});

	it("cascade deletes endpoints when token is deleted", async () => {
		const { token } = await createTestToken();
		await createEndpoint(token.id, { name: "WH 1" });
		await createEndpoint(token.id, { name: "WH 2" });

		// Import revokeToken won't delete — we need actual delete
		const { db } = await import("$lib/server/db");
		const { tokens } = await import("$lib/server/db/schema");
		const { eq } = await import("drizzle-orm");
		await db.delete(tokens).where(eq(tokens.id, token.id));

		const remaining = await listEndpoints();
		expect(remaining).toHaveLength(0);
	});
});
```

- [ ] **Step 2: Update test helpers**

Add to `tests/helpers.ts`:

1. Import the new tables at the top:
```ts
import { webhookEndpoints, webhookEvents } from "$lib/server/db/schema";
```

2. Add to `truncateAll()` — insert these two lines at the top of the function (before other deletes, because of FK ordering):
```ts
await db.delete(webhookEvents);
await db.delete(webhookEndpoints);
```

3. Add helper function:
```ts
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
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/integration/webhook-endpoints.test.ts`
Expected: FAIL — module not found

- [ ] **Step 4: Implement webhook-endpoints service**

Create `src/lib/server/services/webhook-endpoints.ts`:

```ts
import { randomBytes } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { db } from "../db";
import { webhookEndpoints, tokens } from "../db/schema";

function generateSlug(): string {
	return `wh_${randomBytes(24).toString("hex")}`;
}

export async function createEndpoint(
	tokenId: string,
	data: { name: string; secret?: string; signatureHeader?: string },
) {
	const slug = generateSlug();
	const [row] = await db
		.insert(webhookEndpoints)
		.values({
			tokenId,
			slug,
			name: data.name,
			secret: data.secret ?? null,
			signatureHeader: data.signatureHeader ?? null,
		})
		.returning();
	return row;
}

export async function listEndpoints(tokenId?: string) {
	const query = db
		.select({
			id: webhookEndpoints.id,
			tokenId: webhookEndpoints.tokenId,
			tokenName: tokens.name,
			slug: webhookEndpoints.slug,
			name: webhookEndpoints.name,
			secret: webhookEndpoints.secret,
			signatureHeader: webhookEndpoints.signatureHeader,
			enabled: webhookEndpoints.enabled,
			createdAt: webhookEndpoints.createdAt,
			updatedAt: webhookEndpoints.updatedAt,
		})
		.from(webhookEndpoints)
		.leftJoin(tokens, eq(webhookEndpoints.tokenId, tokens.id))
		.orderBy(desc(webhookEndpoints.createdAt));

	if (tokenId) {
		return query.where(eq(webhookEndpoints.tokenId, tokenId));
	}
	return query;
}

export async function getEndpoint(id: string) {
	const [row] = await db
		.select()
		.from(webhookEndpoints)
		.where(eq(webhookEndpoints.id, id))
		.limit(1);
	return row ?? null;
}

export async function getEndpointBySlug(slug: string) {
	const [row] = await db
		.select()
		.from(webhookEndpoints)
		.where(eq(webhookEndpoints.slug, slug))
		.limit(1);
	return row ?? null;
}

export async function deleteEndpoint(id: string) {
	await db.delete(webhookEndpoints).where(eq(webhookEndpoints.id, id));
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/integration/webhook-endpoints.test.ts`
Expected: All 8 tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/services/webhook-endpoints.ts tests/integration/webhook-endpoints.test.ts tests/helpers.ts
git commit -m "feat: add webhook-endpoints service with integration tests"
```

---

## Task 4: Webhook Events Service

**Files:**
- Create: `src/lib/server/services/webhook-events.ts`
- Create: `tests/integration/webhook-events.test.ts`

- [ ] **Step 1: Write failing integration tests**

Create `tests/integration/webhook-events.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import {
	createEvent,
	getPendingEvents,
	acknowledgeEvents,
	cleanupExpiredEvents,
} from "$lib/server/services/webhook-events";
import { createEndpoint } from "$lib/server/services/webhook-endpoints";
import { createTestToken, truncateAll } from "../helpers";
import { db } from "$lib/server/db";
import { webhookEvents } from "$lib/server/db/schema";
import { eq } from "drizzle-orm";

describe("webhook-events service", () => {
	beforeEach(async () => {
		await truncateAll();
	});

	it("creates a pending event with 7-day expiry", async () => {
		const { token } = await createTestToken();
		const endpoint = await createEndpoint(token.id, { name: "Test" });
		const event = await createEvent(endpoint.id, { "content-type": "application/json" }, { action: "create" });

		expect(event.id).toBeDefined();
		expect(event.status).toBe("pending");
		expect(event.endpointId).toBe(endpoint.id);
		expect(event.body).toEqual({ action: "create" });
		expect(event.deliveredAt).toBeNull();

		const expiresAt = new Date(event.expiresAt);
		const receivedAt = new Date(event.receivedAt);
		const diffDays = (expiresAt.getTime() - receivedAt.getTime()) / (1000 * 60 * 60 * 24);
		expect(diffDays).toBeCloseTo(7, 0);
	});

	it("returns pending events for a token across all endpoints", async () => {
		const { token } = await createTestToken();
		const ep1 = await createEndpoint(token.id, { name: "Linear" });
		const ep2 = await createEndpoint(token.id, { name: "GitHub" });
		await createEvent(ep1.id, {}, { source: "linear" });
		await createEvent(ep2.id, {}, { source: "github" });

		const events = await getPendingEvents(token.id);
		expect(events).toHaveLength(2);
	});

	it("returns pending events filtered by endpointId", async () => {
		const { token } = await createTestToken();
		const ep1 = await createEndpoint(token.id, { name: "Linear" });
		const ep2 = await createEndpoint(token.id, { name: "GitHub" });
		await createEvent(ep1.id, {}, { source: "linear" });
		await createEvent(ep2.id, {}, { source: "github" });

		const events = await getPendingEvents(token.id, ep1.id);
		expect(events).toHaveLength(1);
		expect(events[0].body).toEqual({ source: "linear" });
	});

	it("does not return events belonging to another token", async () => {
		const { token: token1 } = await createTestToken("Agent A");
		const { token: token2 } = await createTestToken("Agent B");
		const ep1 = await createEndpoint(token1.id, { name: "WH1" });
		const ep2 = await createEndpoint(token2.id, { name: "WH2" });
		await createEvent(ep1.id, {}, { for: "agent-a" });
		await createEvent(ep2.id, {}, { for: "agent-b" });

		const events = await getPendingEvents(token1.id);
		expect(events).toHaveLength(1);
		expect(events[0].body).toEqual({ for: "agent-a" });
	});

	it("acknowledges events and sets deliveredAt", async () => {
		const { token } = await createTestToken();
		const endpoint = await createEndpoint(token.id, { name: "Test" });
		const event1 = await createEvent(endpoint.id, {}, { n: 1 });
		const event2 = await createEvent(endpoint.id, {}, { n: 2 });

		const count = await acknowledgeEvents(token.id, [event1.id, event2.id]);
		expect(count).toBe(2);

		const pending = await getPendingEvents(token.id);
		expect(pending).toHaveLength(0);
	});

	it("refuses to acknowledge events belonging to another token", async () => {
		const { token: token1 } = await createTestToken("Agent A");
		const { token: token2 } = await createTestToken("Agent B");
		const ep = await createEndpoint(token1.id, { name: "WH" });
		const event = await createEvent(ep.id, {}, { data: "secret" });

		const count = await acknowledgeEvents(token2.id, [event.id]);
		expect(count).toBe(0);

		const pending = await getPendingEvents(token1.id);
		expect(pending).toHaveLength(1);
	});

	it("cleans up expired events", async () => {
		const { token } = await createTestToken();
		const endpoint = await createEndpoint(token.id, { name: "Test" });
		const event = await createEvent(endpoint.id, {}, { old: true });

		// Manually set expiresAt to the past
		await db
			.update(webhookEvents)
			.set({ expiresAt: new Date("2020-01-01") })
			.where(eq(webhookEvents.id, event.id));

		const deleted = await cleanupExpiredEvents();
		expect(deleted).toBe(1);

		const pending = await getPendingEvents(token.id);
		expect(pending).toHaveLength(0);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/integration/webhook-events.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement webhook-events service**

Create `src/lib/server/services/webhook-events.ts`:

```ts
import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { db } from "../db";
import { webhookEndpoints, webhookEvents } from "../db/schema";

const EXPIRY_DAYS = 7;

export async function createEvent(
	endpointId: string,
	headers: Record<string, string>,
	body: unknown,
) {
	const now = new Date();
	const expiresAt = new Date(now.getTime() + EXPIRY_DAYS * 24 * 60 * 60 * 1000);

	const [row] = await db
		.insert(webhookEvents)
		.values({
			endpointId,
			headers,
			body,
			status: "pending",
			receivedAt: now,
			expiresAt,
		})
		.returning();
	return row;
}

export async function getPendingEvents(tokenId: string, endpointId?: string) {
	const conditions = [
		eq(webhookEvents.status, "pending"),
		eq(webhookEndpoints.tokenId, tokenId),
	];

	if (endpointId) {
		conditions.push(eq(webhookEvents.endpointId, endpointId));
	}

	return db
		.select({
			id: webhookEvents.id,
			endpointId: webhookEvents.endpointId,
			endpointName: webhookEndpoints.name,
			headers: webhookEvents.headers,
			body: webhookEvents.body,
			receivedAt: webhookEvents.receivedAt,
		})
		.from(webhookEvents)
		.innerJoin(webhookEndpoints, eq(webhookEvents.endpointId, webhookEndpoints.id))
		.where(and(...conditions));
}

export async function acknowledgeEvents(tokenId: string, eventIds: string[]) {
	if (eventIds.length === 0) return 0;

	// Only acknowledge events that belong to this token's endpoints
	const ownedEndpoints = db
		.select({ id: webhookEndpoints.id })
		.from(webhookEndpoints)
		.where(eq(webhookEndpoints.tokenId, tokenId));

	const result = await db
		.update(webhookEvents)
		.set({ status: "delivered", deliveredAt: new Date() })
		.where(
			and(
				inArray(webhookEvents.id, eventIds),
				eq(webhookEvents.status, "pending"),
				inArray(webhookEvents.endpointId, ownedEndpoints),
			),
		);

	return result.rowCount ?? 0;
}

export async function cleanupExpiredEvents() {
	const result = await db
		.delete(webhookEvents)
		.where(lt(webhookEvents.expiresAt, new Date()));
	return result.rowCount ?? 0;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/integration/webhook-events.test.ts`
Expected: All 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/services/webhook-events.ts tests/integration/webhook-events.test.ts
git commit -m "feat: add webhook-events service with integration tests"
```

---

## Task 5: Incoming Webhook Route (Public)

**Files:**
- Create: `src/routes/webhooks/incoming/[slug]/+server.ts`
- Modify: `src/hooks.server.ts`

- [ ] **Step 1: Add `/webhooks/` to auth bypass in hooks.server.ts**

In `src/hooks.server.ts`, add `pathname.startsWith("/webhooks/")` to the auth bypass condition (line 28-38). Add it after the `/discovery` check:

```ts
		pathname.startsWith("/discovery") ||
		pathname.startsWith("/webhooks/") ||
		pathname.startsWith("/verify-connection") ||
```

- [ ] **Step 2: Create the incoming webhook route**

Create `src/routes/webhooks/incoming/[slug]/+server.ts`:

```ts
import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { getEndpointBySlug } from "$lib/server/services/webhook-endpoints";
import { createEvent } from "$lib/server/services/webhook-events";
import { verifySignature } from "$lib/server/utils/hmac";

export const POST: RequestHandler = async ({ params, request }) => {
	const endpoint = await getEndpointBySlug(params.slug);
	if (!endpoint) throw error(404, "Webhook endpoint not found");
	if (!endpoint.enabled) throw error(404, "Webhook endpoint not found");

	const rawBody = await request.text();

	if (endpoint.secret && endpoint.signatureHeader) {
		const signature = request.headers.get(endpoint.signatureHeader);
		if (!signature) throw error(401, "Missing signature header");
		if (!verifySignature(endpoint.secret, rawBody, signature)) {
			throw error(401, "Invalid signature");
		}
	}

	let body: unknown;
	try {
		body = JSON.parse(rawBody);
	} catch {
		body = rawBody;
	}

	const headers: Record<string, string> = {};
	for (const [key, value] of request.headers.entries()) {
		if (key.startsWith("x-") || key === "content-type") {
			headers[key] = value;
		}
	}

	await createEvent(endpoint.id, headers, body);

	return json({ ok: true });
};
```

- [ ] **Step 3: Commit**

```bash
git add src/routes/webhooks/incoming/[slug]/+server.ts src/hooks.server.ts
git commit -m "feat: add public incoming webhook route with signature verification"
```

---

## Task 6: Agent-Facing Poll & ACK Routes

**Files:**
- Create: `src/routes/webhooks/poll/+server.ts`
- Create: `src/routes/webhooks/ack/+server.ts`

- [ ] **Step 1: Create poll route**

Create `src/routes/webhooks/poll/+server.ts`:

```ts
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireBearer } from "$lib/server/api-auth";
import { getPendingEvents } from "$lib/server/services/webhook-events";

export const GET: RequestHandler = async ({ request, url }) => {
	const token = await requireBearer(request);
	const endpointId = url.searchParams.get("endpointId") ?? undefined;
	const events = await getPendingEvents(token.id, endpointId);
	return json({ events });
};
```

- [ ] **Step 2: Create ACK route**

Create `src/routes/webhooks/ack/+server.ts`:

```ts
import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireBearer } from "$lib/server/api-auth";
import { acknowledgeEvents } from "$lib/server/services/webhook-events";

export const POST: RequestHandler = async ({ request }) => {
	const token = await requireBearer(request);
	const body = await request.json().catch(() => ({}));

	const eventIds = Array.isArray(body.eventIds) ? body.eventIds : [];
	if (eventIds.length === 0) throw error(400, "eventIds is required");
	if (!eventIds.every((id: unknown) => typeof id === "string")) {
		throw error(400, "eventIds must be an array of strings");
	}

	const count = await acknowledgeEvents(token.id, eventIds);
	return json({ acknowledged: count });
};
```

- [ ] **Step 3: Commit**

```bash
git add src/routes/webhooks/poll/+server.ts src/routes/webhooks/ack/+server.ts
git commit -m "feat: add agent-facing webhook poll and ack routes"
```

---

## Task 7: Admin API Routes

**Files:**
- Create: `src/routes/api/webhook-endpoints/+server.ts`
- Create: `src/routes/api/webhook-endpoints/[id]/+server.ts`
- Create: `src/routes/api/webhook-events/+server.ts`
- Create: `src/routes/api/webhook-events/cleanup/+server.ts`

- [ ] **Step 1: Create webhook-endpoints list + create API**

Create `src/routes/api/webhook-endpoints/+server.ts`:

```ts
import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireAdmin } from "$lib/server/api-auth";
import { createEndpoint, listEndpoints } from "$lib/server/services/webhook-endpoints";

export const GET: RequestHandler = async ({ request, url }) => {
	await requireAdmin(request);
	const tokenId = url.searchParams.get("tokenId") ?? undefined;
	const endpoints = await listEndpoints(tokenId);
	return json(endpoints);
};

export const POST: RequestHandler = async ({ request }) => {
	await requireAdmin(request);
	const body = await request.json().catch(() => ({}));

	const tokenId = typeof body.tokenId === "string" ? body.tokenId.trim() : "";
	if (!tokenId) throw error(400, "tokenId is required");

	const name = typeof body.name === "string" ? body.name.trim() : "";
	if (!name) throw error(400, "name is required");

	const secret = typeof body.secret === "string" && body.secret.trim() ? body.secret.trim() : undefined;
	const signatureHeader = typeof body.signatureHeader === "string" && body.signatureHeader.trim()
		? body.signatureHeader.trim()
		: undefined;

	const endpoint = await createEndpoint(tokenId, { name, secret, signatureHeader });
	return json(endpoint, { status: 201 });
};
```

- [ ] **Step 2: Create webhook-endpoints detail + delete API**

Create `src/routes/api/webhook-endpoints/[id]/+server.ts`:

```ts
import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireAdmin } from "$lib/server/api-auth";
import { getEndpoint, deleteEndpoint } from "$lib/server/services/webhook-endpoints";

export const GET: RequestHandler = async ({ request, params }) => {
	await requireAdmin(request);
	const endpoint = await getEndpoint(params.id);
	if (!endpoint) throw error(404, "Webhook endpoint not found");
	return json(endpoint);
};

export const DELETE: RequestHandler = async ({ request, params }) => {
	await requireAdmin(request);
	await deleteEndpoint(params.id);
	return json({ ok: true });
};
```

- [ ] **Step 3: Create webhook-events list API**

Create `src/routes/api/webhook-events/+server.ts`:

```ts
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireAdmin } from "$lib/server/api-auth";
import { db } from "$lib/server/db";
import { webhookEvents, webhookEndpoints } from "$lib/server/db/schema";
import { and, desc, eq } from "drizzle-orm";

export const GET: RequestHandler = async ({ request, url }) => {
	await requireAdmin(request);

	const endpointId = url.searchParams.get("endpointId");
	const status = url.searchParams.get("status");
	const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50"), 200);
	const offset = parseInt(url.searchParams.get("offset") ?? "0");

	const conditions = [];
	if (endpointId) conditions.push(eq(webhookEvents.endpointId, endpointId));
	if (status) conditions.push(eq(webhookEvents.status, status as "pending" | "delivered" | "expired"));

	const events = await db
		.select({
			id: webhookEvents.id,
			endpointId: webhookEvents.endpointId,
			endpointName: webhookEndpoints.name,
			headers: webhookEvents.headers,
			body: webhookEvents.body,
			status: webhookEvents.status,
			receivedAt: webhookEvents.receivedAt,
			deliveredAt: webhookEvents.deliveredAt,
			expiresAt: webhookEvents.expiresAt,
		})
		.from(webhookEvents)
		.leftJoin(webhookEndpoints, eq(webhookEvents.endpointId, webhookEndpoints.id))
		.where(conditions.length > 0 ? and(...conditions) : undefined)
		.orderBy(desc(webhookEvents.receivedAt))
		.limit(limit)
		.offset(offset);

	return json(events);
};
```

- [ ] **Step 4: Create cleanup API**

Create `src/routes/api/webhook-events/cleanup/+server.ts`:

```ts
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireAdmin } from "$lib/server/api-auth";
import { cleanupExpiredEvents } from "$lib/server/services/webhook-events";

export const POST: RequestHandler = async ({ request }) => {
	await requireAdmin(request);
	const deleted = await cleanupExpiredEvents();
	return json({ deleted });
};
```

- [ ] **Step 5: Commit**

```bash
git add src/routes/api/webhook-endpoints/ src/routes/api/webhook-events/
git commit -m "feat: add admin API routes for webhook endpoints and events"
```

---

## Task 8: Dashboard — Webhooks List Page

**Files:**
- Create: `src/routes/(app)/webhooks/+page.server.ts`
- Create: `src/routes/(app)/webhooks/+page.svelte`
- Modify: `src/lib/components/app-sidebar.svelte`

- [ ] **Step 1: Add Webhooks to sidebar navigation**

In `src/lib/components/app-sidebar.svelte`, add the Webhooks item to the Gateway group (line 10):

```ts
		{
			title: "Gateway",
			items: [
				{ title: "Targets", url: "/targets" },
				{ title: "Webhooks", url: "/webhooks" },
			],
		},
```

- [ ] **Step 2: Create page server load + actions**

Create `src/routes/(app)/webhooks/+page.server.ts`:

```ts
import { fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { listEndpoints, createEndpoint, deleteEndpoint } from "$lib/server/services/webhook-endpoints";
import { listTokens } from "$lib/server/services/tokens";
import { db } from "$lib/server/db";
import { webhookEvents, webhookEndpoints } from "$lib/server/db/schema";
import { and, eq, sql } from "drizzle-orm";

export const load: PageServerLoad = async () => {
	const [endpoints, tokensList] = await Promise.all([listEndpoints(), listTokens()]);

	// Get pending event counts per endpoint
	const counts = await db
		.select({
			endpointId: webhookEvents.endpointId,
			count: sql<number>`count(*)::int`,
		})
		.from(webhookEvents)
		.where(eq(webhookEvents.status, "pending"))
		.groupBy(webhookEvents.endpointId);

	const countMap = new Map(counts.map((c) => [c.endpointId, c.count]));

	const endpointsWithCounts = endpoints.map((ep) => ({
		...ep,
		pendingCount: countMap.get(ep.id) ?? 0,
	}));

	return { endpoints: endpointsWithCounts, tokens: tokensList };
};

export const actions = {
	create: async ({ request }) => {
		const data = await request.formData();
		const tokenId = data.get("tokenId")?.toString() ?? "";
		const name = data.get("name")?.toString()?.trim() ?? "";
		const secret = data.get("secret")?.toString()?.trim() || undefined;
		const signatureHeader = data.get("signatureHeader")?.toString()?.trim() || undefined;

		if (!tokenId) return fail(400, { error: "API key is required" });
		if (!name) return fail(400, { error: "Name is required" });

		try {
			const endpoint = await createEndpoint(tokenId, { name, secret, signatureHeader });
			return { created: endpoint };
		} catch (err) {
			return fail(400, { error: err instanceof Error ? err.message : "Failed to create webhook" });
		}
	},

	delete: async ({ request }) => {
		const data = await request.formData();
		const id = data.get("id")?.toString() ?? "";
		if (!id) return fail(400, { error: "ID is required" });

		try {
			await deleteEndpoint(id);
			return { deleted: id };
		} catch (err) {
			return fail(500, { error: err instanceof Error ? err.message : "Failed to delete" });
		}
	},
} satisfies Actions;
```

- [ ] **Step 3: Create the webhooks list page**

Create `src/routes/(app)/webhooks/+page.svelte`:

```svelte
<script lang="ts">
	import { enhance } from "$app/forms";
	import { page } from "$app/state";
	import * as Table from "$lib/components/ui/table/index.js";
	import * as Dialog from "$lib/components/ui/dialog/index.js";
	import * as Select from "$lib/components/ui/select/index.js";
	import { Button } from "$lib/components/ui/button/index.js";
	import { Input } from "$lib/components/ui/input/index.js";
	import { Label } from "$lib/components/ui/label/index.js";
	import { Badge } from "$lib/components/ui/badge/index.js";
	import * as Breadcrumb from "$lib/components/ui/breadcrumb/index.js";
	import { Separator } from "$lib/components/ui/separator/index.js";
	import * as SidebarUI from "$lib/components/ui/sidebar/index.js";
	import CopyIcon from "@lucide/svelte/icons/copy";
	import TrashIcon from "@lucide/svelte/icons/trash-2";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import { toast } from "svelte-sonner";

	let { data } = $props();

	type Endpoint = (typeof data.endpoints)[number];

	let localEndpoints = $state<Endpoint[] | null>(null);
	let endpoints = $derived(localEndpoints ?? data.endpoints);

	let createOpen = $state(false);
	let createSubmitting = $state(false);
	let deleteOpen = $state(false);
	let deleteTarget = $state<Endpoint | null>(null);
	let deleteSubmitting = $state(false);
	let selectedTokenId = $state("");

	function webhookUrl(slug: string) {
		return `${page.url.origin}/webhooks/incoming/${slug}`;
	}

	function copyToClipboard(text: string) {
		navigator.clipboard.writeText(text);
		toast.success("Copied to clipboard");
	}

	function formatDate(d: string | Date) {
		return new Date(d).toLocaleDateString("en-US", {
			month: "short",
			day: "numeric",
			year: "numeric",
		});
	}
</script>

<header class="flex h-16 shrink-0 items-center gap-2 border-b px-4">
	<SidebarUI.Trigger class="-ml-1" />
	<Separator orientation="vertical" class="mr-2 !h-4" />
	<Breadcrumb.Root>
		<Breadcrumb.List>
			<Breadcrumb.Item><Breadcrumb.Page>Webhooks</Breadcrumb.Page></Breadcrumb.Item>
		</Breadcrumb.List>
	</Breadcrumb.Root>
</header>

<div class="flex-1 space-y-6 p-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-bold tracking-tight">Webhooks</h1>
			<p class="text-muted-foreground text-sm">Receive incoming webhooks from external services.</p>
		</div>
		<Button onclick={() => { createOpen = true; selectedTokenId = ""; }}>
			<PlusIcon class="mr-2 size-4" />
			New Webhook
		</Button>
	</div>

	{#if endpoints.length === 0}
		<div class="text-muted-foreground flex flex-col items-center justify-center rounded-lg border border-dashed py-12">
			<p class="text-sm">No webhook endpoints yet.</p>
			<Button variant="link" onclick={() => { createOpen = true; }}>Create your first webhook</Button>
		</div>
	{:else}
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head>Name</Table.Head>
					<Table.Head>API Key</Table.Head>
					<Table.Head>Pending</Table.Head>
					<Table.Head>Created</Table.Head>
					<Table.Head class="w-[100px]"></Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each endpoints as endpoint (endpoint.id)}
					<Table.Row>
						<Table.Cell>
							<a href="/webhooks/{endpoint.id}" class="font-medium hover:underline">{endpoint.name}</a>
							<button
								class="text-muted-foreground ml-2 inline-flex items-center text-xs hover:text-foreground"
								onclick={() => copyToClipboard(webhookUrl(endpoint.slug))}
							>
								<CopyIcon class="mr-1 size-3" />
								Copy URL
							</button>
						</Table.Cell>
						<Table.Cell class="text-muted-foreground text-sm">{endpoint.tokenName ?? "—"}</Table.Cell>
						<Table.Cell>
							{#if endpoint.pendingCount > 0}
								<Badge variant="default">{endpoint.pendingCount}</Badge>
							{:else}
								<span class="text-muted-foreground text-sm">0</span>
							{/if}
						</Table.Cell>
						<Table.Cell class="text-muted-foreground text-sm">{formatDate(endpoint.createdAt)}</Table.Cell>
						<Table.Cell>
							<Button
								variant="ghost"
								size="icon"
								onclick={() => { deleteTarget = endpoint; deleteOpen = true; }}
							>
								<TrashIcon class="size-4" />
							</Button>
						</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	{/if}
</div>

<!-- Create Dialog -->
<Dialog.Root bind:open={createOpen} onOpenChange={(open) => { if (!open) { selectedTokenId = ""; } }}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>New Webhook Endpoint</Dialog.Title>
			<Dialog.Description>Create an endpoint to receive webhooks from an external service.</Dialog.Description>
		</Dialog.Header>
		<form
			method="POST"
			action="?/create"
			use:enhance={() => {
				createSubmitting = true;
				return async ({ result, update }) => {
					createSubmitting = false;
					if (result.type === "success" && result.data?.created) {
						const created = result.data.created as Endpoint;
						localEndpoints = [{ ...created, tokenName: data.tokens.find((t) => t.id === created.tokenId)?.name ?? null, pendingCount: 0 }, ...endpoints];
						createOpen = false;
						toast.success("Webhook endpoint created");
					} else if (result.type === "failure") {
						toast.error((result.data?.error as string) ?? "Failed to create");
					}
					await update({ reset: false, invalidateAll: false });
				};
			}}
		>
			<div class="space-y-4 py-4">
				<div class="space-y-2">
					<Label for="name">Name</Label>
					<Input id="name" name="name" placeholder="e.g. Linear webhook" required />
				</div>
				<div class="space-y-2">
					<Label for="tokenId">API Key</Label>
					<Select.Root type="single" name="tokenId" bind:value={selectedTokenId}>
						<Select.Trigger id="tokenId">
							<span>{data.tokens.find((t) => t.id === selectedTokenId)?.name ?? "Select an API key..."}</span>
						</Select.Trigger>
						<Select.Content>
							{#each data.tokens.filter((t) => !t.revokedAt) as token (token.id)}
								<Select.Item value={token.id}>{token.name}</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
				</div>
				<div class="space-y-2">
					<Label for="secret">Secret <span class="text-muted-foreground">(optional)</span></Label>
					<Input id="secret" name="secret" type="password" placeholder="HMAC secret for signature verification" />
				</div>
				<div class="space-y-2">
					<Label for="signatureHeader">Signature Header <span class="text-muted-foreground">(optional)</span></Label>
					<Input id="signatureHeader" name="signatureHeader" placeholder="e.g. X-Hub-Signature-256" />
				</div>
			</div>
			<Dialog.Footer>
				<Button variant="outline" onclick={() => { createOpen = false; }}>Cancel</Button>
				<Button type="submit" disabled={createSubmitting}>
					{createSubmitting ? "Creating..." : "Create"}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>

<!-- Delete Confirmation Dialog -->
<Dialog.Root bind:open={deleteOpen} onOpenChange={(open) => { if (!open) deleteTarget = null; }}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Delete Webhook</Dialog.Title>
			<Dialog.Description>
				This will permanently delete <strong>{deleteTarget?.name}</strong> and all its stored events. This action cannot be undone.
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
						localEndpoints = endpoints.filter((e) => e.id !== result.data?.deleted);
						deleteOpen = false;
						toast.success("Webhook deleted");
					} else if (result.type === "failure") {
						toast.error((result.data?.error as string) ?? "Failed to delete");
					}
					await update({ reset: false, invalidateAll: false });
				};
			}}
		>
			<input type="hidden" name="id" value={deleteTarget?.id ?? ""} />
			<Dialog.Footer>
				<Button variant="outline" onclick={() => { deleteOpen = false; }}>Cancel</Button>
				<Button type="submit" variant="destructive" disabled={deleteSubmitting}>
					{deleteSubmitting ? "Deleting..." : "Delete"}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/components/app-sidebar.svelte src/routes/\(app\)/webhooks/
git commit -m "feat: add webhooks list page with create and delete"
```

---

## Task 9: Dashboard — Webhook Detail Page

**Files:**
- Create: `src/routes/(app)/webhooks/[id]/+page.server.ts`
- Create: `src/routes/(app)/webhooks/[id]/+page.svelte`

- [ ] **Step 1: Create detail page server load**

Create `src/routes/(app)/webhooks/[id]/+page.server.ts`:

```ts
import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { getEndpoint } from "$lib/server/services/webhook-endpoints";
import { getTokenById } from "$lib/server/services/tokens";
import { db } from "$lib/server/db";
import { webhookEvents, webhookEndpoints } from "$lib/server/db/schema";
import { and, desc, eq } from "drizzle-orm";

export const load: PageServerLoad = async ({ params }) => {
	const endpoint = await getEndpoint(params.id);
	if (!endpoint) throw error(404, "Webhook endpoint not found");

	const token = await getTokenById(endpoint.tokenId);

	const events = await db
		.select({
			id: webhookEvents.id,
			headers: webhookEvents.headers,
			body: webhookEvents.body,
			status: webhookEvents.status,
			receivedAt: webhookEvents.receivedAt,
			deliveredAt: webhookEvents.deliveredAt,
		})
		.from(webhookEvents)
		.where(eq(webhookEvents.endpointId, endpoint.id))
		.orderBy(desc(webhookEvents.receivedAt))
		.limit(50);

	return {
		endpoint,
		tokenName: token?.name ?? "Unknown",
		events,
	};
};
```

- [ ] **Step 2: Create detail page component**

Create `src/routes/(app)/webhooks/[id]/+page.svelte`:

```svelte
<script lang="ts">
	import { page } from "$app/state";
	import * as Table from "$lib/components/ui/table/index.js";
	import * as Dialog from "$lib/components/ui/dialog/index.js";
	import { Button } from "$lib/components/ui/button/index.js";
	import { Badge } from "$lib/components/ui/badge/index.js";
	import * as Breadcrumb from "$lib/components/ui/breadcrumb/index.js";
	import { Separator } from "$lib/components/ui/separator/index.js";
	import * as SidebarUI from "$lib/components/ui/sidebar/index.js";
	import CopyIcon from "@lucide/svelte/icons/copy";
	import { toast } from "svelte-sonner";

	let { data } = $props();

	let selectedEvent = $state<(typeof data.events)[number] | null>(null);
	let eventDialogOpen = $state(false);

	function webhookUrl() {
		return `${page.url.origin}/webhooks/incoming/${data.endpoint.slug}`;
	}

	function copyToClipboard(text: string) {
		navigator.clipboard.writeText(text);
		toast.success("Copied to clipboard");
	}

	function formatDate(d: string | Date) {
		return new Date(d).toLocaleDateString("en-US", {
			month: "short",
			day: "numeric",
			year: "numeric",
			hour: "2-digit",
			minute: "2-digit",
		});
	}

	function statusVariant(status: string): "default" | "secondary" | "outline" {
		if (status === "pending") return "default";
		if (status === "delivered") return "secondary";
		return "outline";
	}

	function previewBody(body: unknown): string {
		const str = typeof body === "string" ? body : JSON.stringify(body);
		return str.length > 100 ? str.slice(0, 100) + "..." : str;
	}

	function secretHint(secret: string | null): string {
		if (!secret) return "Not configured";
		if (secret.length <= 8) return "****";
		return secret.slice(0, 4) + "..." + secret.slice(-4);
	}
</script>

<header class="flex h-16 shrink-0 items-center gap-2 border-b px-4">
	<SidebarUI.Trigger class="-ml-1" />
	<Separator orientation="vertical" class="mr-2 !h-4" />
	<Breadcrumb.Root>
		<Breadcrumb.List>
			<Breadcrumb.Item><Breadcrumb.Link href="/webhooks">Webhooks</Breadcrumb.Link></Breadcrumb.Item>
			<Breadcrumb.Separator />
			<Breadcrumb.Item><Breadcrumb.Page>{data.endpoint.name}</Breadcrumb.Page></Breadcrumb.Item>
		</Breadcrumb.List>
	</Breadcrumb.Root>
</header>

<div class="flex-1 space-y-6 p-6">
	<div>
		<h1 class="text-2xl font-bold tracking-tight">{data.endpoint.name}</h1>
		<p class="text-muted-foreground text-sm">Linked to API key: <strong>{data.tokenName}</strong></p>
	</div>

	<!-- Endpoint Details -->
	<div class="rounded-lg border p-4 space-y-3">
		<h2 class="text-sm font-semibold">Endpoint Details</h2>
		<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
			<div>
				<p class="text-muted-foreground text-xs">Webhook URL</p>
				<div class="flex items-center gap-2">
					<code class="text-sm break-all">{webhookUrl()}</code>
					<button onclick={() => copyToClipboard(webhookUrl())} class="text-muted-foreground hover:text-foreground shrink-0">
						<CopyIcon class="size-3.5" />
					</button>
				</div>
			</div>
			<div>
				<p class="text-muted-foreground text-xs">Secret</p>
				<code class="text-sm">{secretHint(data.endpoint.secret)}</code>
			</div>
			<div>
				<p class="text-muted-foreground text-xs">Signature Header</p>
				<code class="text-sm">{data.endpoint.signatureHeader ?? "Not configured"}</code>
			</div>
			<div>
				<p class="text-muted-foreground text-xs">Status</p>
				<Badge variant={data.endpoint.enabled ? "default" : "outline"}>
					{data.endpoint.enabled ? "Enabled" : "Disabled"}
				</Badge>
			</div>
		</div>
	</div>

	<!-- Events Table -->
	<div class="space-y-3">
		<h2 class="text-sm font-semibold">Recent Events</h2>
		{#if data.events.length === 0}
			<div class="text-muted-foreground flex flex-col items-center justify-center rounded-lg border border-dashed py-8">
				<p class="text-sm">No events received yet.</p>
				<p class="text-xs mt-1">Configure this URL in your external service to start receiving webhooks.</p>
			</div>
		{:else}
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>Status</Table.Head>
						<Table.Head>Payload Preview</Table.Head>
						<Table.Head>Received</Table.Head>
						<Table.Head>Delivered</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each data.events as event (event.id)}
						<Table.Row
							class="cursor-pointer"
							onclick={() => { selectedEvent = event; eventDialogOpen = true; }}
						>
							<Table.Cell>
								<Badge variant={statusVariant(event.status)}>{event.status}</Badge>
							</Table.Cell>
							<Table.Cell class="text-muted-foreground max-w-xs truncate font-mono text-xs">
								{previewBody(event.body)}
							</Table.Cell>
							<Table.Cell class="text-muted-foreground text-sm">{formatDate(event.receivedAt)}</Table.Cell>
							<Table.Cell class="text-muted-foreground text-sm">
								{event.deliveredAt ? formatDate(event.deliveredAt) : "—"}
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		{/if}
	</div>
</div>

<!-- Event Detail Dialog -->
<Dialog.Root bind:open={eventDialogOpen} onOpenChange={(open) => { if (!open) selectedEvent = null; }}>
	<Dialog.Content class="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
		<Dialog.Header>
			<Dialog.Title>Event Detail</Dialog.Title>
			<Dialog.Description>
				{#if selectedEvent}
					Received {formatDate(selectedEvent.receivedAt)}
				{/if}
			</Dialog.Description>
		</Dialog.Header>
		{#if selectedEvent}
			<div class="space-y-4">
				<div>
					<h3 class="mb-1 text-sm font-semibold">Headers</h3>
					<pre class="bg-muted max-h-48 overflow-auto rounded-md p-3 text-xs">{JSON.stringify(selectedEvent.headers, null, 2)}</pre>
				</div>
				<div>
					<h3 class="mb-1 text-sm font-semibold">Body</h3>
					<pre class="bg-muted max-h-96 overflow-auto rounded-md p-3 text-xs">{JSON.stringify(selectedEvent.body, null, 2)}</pre>
				</div>
			</div>
		{/if}
	</Dialog.Content>
</Dialog.Root>
```

- [ ] **Step 3: Commit**

```bash
git add src/routes/\(app\)/webhooks/\[id\]/
git commit -m "feat: add webhook endpoint detail page with event viewer"
```

---

## Task 10: Update Discovery Route

**Files:**
- Modify: `src/routes/discovery/+server.ts`

- [ ] **Step 1: Add webhook endpoints to discovery response**

In `src/routes/discovery/+server.ts`, add webhook endpoint info to the response. Import `listEndpoints` and add a `webhooks` section:

Add import at the top:
```ts
import { listEndpoints } from "$lib/server/services/webhook-endpoints";
```

After the targets mapping, before the return, add:

```ts
	const webhookEndpointsList = await listEndpoints(token.id);
	const webhooks = webhookEndpointsList
		.filter((ep) => ep.enabled)
		.map((ep) => ({
			name: ep.name,
			poll: "/webhooks/poll",
			ack: "/webhooks/ack",
		}));
```

Update the return to include webhooks:

```ts
	return json({
		targets: filtered,
		webhooks,
		...(filtered.length === 0 && webhooks.length === 0 && {
			message: `No targets or webhooks are assigned to this API key. Tell the user to go to ${url.origin}/api-keys to add targets, or ${url.origin}/webhooks to set up webhooks.`,
		}),
	});
```

- [ ] **Step 2: Commit**

```bash
git add src/routes/discovery/+server.ts
git commit -m "feat: include webhook endpoints in discovery response"
```

---

## Task 11: Final Verification

- [ ] **Step 1: Run all tests**

Run: `npx vitest run`
Expected: All tests pass (existing + new webhook tests)

- [ ] **Step 2: Run type check**

Run: `npx svelte-check --tsconfig ./tsconfig.json`
Expected: No type errors

- [ ] **Step 3: Run lint**

Run: `npx eslint .`
Expected: No lint errors

- [ ] **Step 4: Manual verification checklist**

Start dev server (`npm run dev`) and verify:
1. Sidebar shows "Webhooks" under Gateway
2. `/webhooks` page loads with empty state
3. Create a webhook endpoint — URL is generated and copyable
4. Webhook detail page shows endpoint info
5. POST to `/webhooks/incoming/<slug>` with JSON body returns 200
6. Poll via `GET /webhooks/poll` with bearer token returns the event
7. ACK via `POST /webhooks/ack` with event IDs marks as delivered

- [ ] **Step 5: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address any issues found during verification"
```
