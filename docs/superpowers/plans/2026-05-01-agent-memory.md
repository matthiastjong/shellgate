# Agent Memory MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add long-term memory to Shellgate with 4 MCP tools (memory_list, memory_read, memory_add, memory_delete), three visibility levels (org/user/token), defaultUser identity binding on tokens, and a read-only dashboard page.

**Architecture:** New `memories` table with visibility-based access control. Service layer handles CRUD + visibility queries. MCP tools delegate to service. Token table extended with `defaultUser` for server-side user identity resolution. Dashboard page is read-only — agents own all writes.

**Tech Stack:** SvelteKit, Drizzle ORM, PostgreSQL, MCP SDK (zod), shadcn-svelte, Vitest + Testcontainers

**Spec:** `docs/superpowers/specs/2026-05-01-agent-memory-design.md`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/lib/server/db/schema.ts` | Modify | Add `memories` table + `defaultUser` column on `tokens` |
| `src/lib/server/services/memories.ts` | Create | CRUD + visibility query logic |
| `src/lib/server/services/tokens.ts` | Modify | Add `updateDefaultUser`, include `defaultUser` in selects |
| `src/lib/server/mcp/tools/memories.ts` | Create | 4 MCP tool handlers |
| `src/lib/server/mcp/server.ts` | Modify | Register memory tools, update instructions |
| `src/lib/server/mcp/tools/discover.ts` | Modify | Add `memoryCount` to response |
| `src/routes/(app)/memories/+page.server.ts` | Create | Load all memories for dashboard |
| `src/routes/(app)/memories/+page.svelte` | Create | Read-only memory browser |
| `src/routes/(app)/api-keys/[id]/+page.server.ts` | Modify | Add `setDefaultUser` action |
| `src/routes/(app)/api-keys/[id]/+page.svelte` | Modify | Show defaultUser field |
| `src/lib/components/app-sidebar.svelte` | Modify | Add "Memories" nav item |
| `tests/helpers.ts` | Modify | Add `memories` to `truncateAll`, add helper |
| `tests/integration/memories.test.ts` | Create | Service integration tests |

---

### Task 1: Database Schema — memories table + defaultUser on tokens

**Files:**
- Modify: `src/lib/server/db/schema.ts`

- [ ] **Step 1: Add `defaultUser` column to tokens table**

In `src/lib/server/db/schema.ts`, add after the `updatedAt` field in the `tokens` table:

```typescript
defaultUser: varchar("default_user", { length: 128 }),
```

- [ ] **Step 2: Add memories table**

In `src/lib/server/db/schema.ts`, add after the `skills` table definition:

```typescript
export const memories = pgTable(
	"memories",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		tokenId: uuid("token_id")
			.notNull()
			.references(() => tokens.id, { onDelete: "cascade" }),
		userIdentifier: varchar("user_identifier", { length: 128 }),
		visibility: varchar("visibility", { length: 16 }).notNull(),
		summary: varchar("summary", { length: 500 }).notNull(),
		content: text("content").notNull(),
		metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		index("idx_memories_token").on(t.tokenId),
		index("idx_memories_visibility").on(t.visibility),
		index("idx_memories_user").on(t.userIdentifier),
	],
);

export type Memory = typeof memories.$inferSelect;
```

- [ ] **Step 3: Push schema to dev database**

Run: `npx drizzle-kit push`

Verify the `memories` table and `default_user` column exist by checking the output for `CREATE TABLE` and `ALTER TABLE` statements.

- [ ] **Step 4: Commit**

```bash
git add src/lib/server/db/schema.ts
git commit -m "feat(memory): add memories table and defaultUser column to tokens"
```

---

### Task 2: Update tokens service — include defaultUser in queries + add update function

**Files:**
- Modify: `src/lib/server/services/tokens.ts`

- [ ] **Step 1: Add `defaultUser` to `listTokens` select**

In `src/lib/server/services/tokens.ts`, add `defaultUser: tokens.defaultUser` to the select object in `listTokens()` (after `updatedAt`).

- [ ] **Step 2: Add `defaultUser` to `getTokenById` select**

In `src/lib/server/services/tokens.ts`, add `defaultUser: tokens.defaultUser` to the select object in `getTokenById()` (after `updatedAt`).

- [ ] **Step 3: Add `defaultUser` to `regenerateToken` returning**

In `src/lib/server/services/tokens.ts`, add `defaultUser: tokens.defaultUser` to the returning object in `regenerateToken()` (after `updatedAt`).

- [ ] **Step 4: Add `updateDefaultUser` function**

Add at the end of `src/lib/server/services/tokens.ts`:

```typescript
export async function updateDefaultUser(id: string, defaultUser: string | null) {
	const [existing] = await db
		.select({ id: tokens.id })
		.from(tokens)
		.where(eq(tokens.id, id))
		.limit(1);

	if (!existing) return null;

	const [updated] = await db
		.update(tokens)
		.set({ defaultUser, updatedAt: new Date() })
		.where(eq(tokens.id, id))
		.returning({ id: tokens.id, defaultUser: tokens.defaultUser });

	return updated;
}
```

- [ ] **Step 5: Verify `findTokenByHash` already returns full row**

Check that `findTokenByHash` uses `select()` (no column restriction) so it already returns `defaultUser`. It does — it uses `.select()` which returns all columns. No change needed.

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/services/tokens.ts
git commit -m "feat(memory): include defaultUser in token queries and add updateDefaultUser"
```

---

### Task 3: Memories service — CRUD + visibility queries

**Files:**
- Create: `src/lib/server/services/memories.ts`

- [ ] **Step 1: Write the failing test for `addMemory`**

Create `tests/integration/memories.test.ts`:

```typescript
import { beforeEach, describe, expect, it } from "vitest";
import { createTestToken, truncateAll } from "../helpers";

describe("memories service", () => {
	beforeEach(async () => {
		await truncateAll();
	});

	it("adds an org-level memory", async () => {
		const { addMemory } = await import("$lib/server/services/memories");
		const { token } = await createTestToken();

		const memory = await addMemory({
			tokenId: token.id,
			userIdentifier: null,
			visibility: "org",
			summary: "Sneakerbaron deploys via Coolify",
			content: "Sneakerbaron is hosted on Hetzner and deploys via Coolify. Repo: github.com/example/sneakerbaron",
			metadata: { project: "sneakerbaron" },
		});

		expect(memory.id).toBeDefined();
		expect(memory.visibility).toBe("org");
		expect(memory.summary).toBe("Sneakerbaron deploys via Coolify");
		expect(memory.content).toContain("Coolify");
		expect(memory.metadata).toEqual({ project: "sneakerbaron" });
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/integration/memories.test.ts`

Expected: FAIL — cannot import `$lib/server/services/memories`

- [ ] **Step 3: Implement `addMemory`**

Create `src/lib/server/services/memories.ts`:

```typescript
import { and, eq, or, desc, sql } from "drizzle-orm";
import { db } from "../db";
import { memories } from "../db/schema";

type AddMemoryInput = {
	tokenId: string;
	userIdentifier: string | null;
	visibility: "org" | "user" | "token";
	summary: string;
	content: string;
	metadata?: Record<string, unknown>;
};

export async function addMemory(input: AddMemoryInput) {
	if (input.visibility === "user" && !input.userIdentifier) {
		throw new Error("user visibility requires a user identifier");
	}
	if (input.summary.length > 500) {
		throw new Error("summary must be 500 characters or less");
	}

	const [row] = await db
		.insert(memories)
		.values({
			tokenId: input.tokenId,
			userIdentifier: input.userIdentifier,
			visibility: input.visibility,
			summary: input.summary,
			content: input.content,
			metadata: input.metadata ?? {},
		})
		.returning();
	return row;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/integration/memories.test.ts`

Expected: PASS

- [ ] **Step 5: Write failing test for `listMemories` visibility logic**

Add to `tests/integration/memories.test.ts`:

```typescript
it("lists memories with correct visibility filtering", async () => {
	const { addMemory, listMemories } = await import("$lib/server/services/memories");
	const { token: token1 } = await createTestToken("Agent Matthias");
	const { token: token2 } = await createTestToken("Agent Bedran");

	// Org memory — visible to everyone
	await addMemory({
		tokenId: token1.id,
		userIdentifier: null,
		visibility: "org",
		summary: "Org fact",
		content: "Org fact content",
	});

	// User memory for matthias — visible to matthias only
	await addMemory({
		tokenId: token1.id,
		userIdentifier: "matthias",
		visibility: "user",
		summary: "Matthias preference",
		content: "Matthias preference content",
	});

	// Token memory for token1 — visible to token1 only
	await addMemory({
		tokenId: token1.id,
		userIdentifier: null,
		visibility: "token",
		summary: "Token1 private",
		content: "Token1 private content",
	});

	// Token memory for token2 — visible to token2 only
	await addMemory({
		tokenId: token2.id,
		userIdentifier: null,
		visibility: "token",
		summary: "Token2 private",
		content: "Token2 private content",
	});

	// Matthias via token1 sees: org + user:matthias + token1
	const result1 = await listMemories(token1.id, "matthias");
	expect(result1.memories).toHaveLength(3);
	expect(result1.hasMore).toBe(false);

	// Bedran via token2 sees: org + token2 (not matthias' user memory, not token1)
	const result2 = await listMemories(token2.id, "bedran");
	expect(result2.memories).toHaveLength(2);
	const summaries2 = result2.memories.map((m) => m.summary);
	expect(summaries2).toContain("Org fact");
	expect(summaries2).toContain("Token2 private");
	expect(summaries2).not.toContain("Matthias preference");
	expect(summaries2).not.toContain("Token1 private");
});
```

- [ ] **Step 6: Implement `listMemories`**

Add to `src/lib/server/services/memories.ts`:

```typescript
const LIST_LIMIT = 101; // 100 + 1 to detect hasMore

export async function listMemories(
	tokenId: string,
	resolvedUser?: string | null,
	filters?: { visibility?: string; user?: string },
) {
	const conditions = [
		or(
			eq(memories.visibility, "org"),
			...(resolvedUser
				? [and(eq(memories.visibility, "user"), eq(memories.userIdentifier, resolvedUser))]
				: []),
			and(eq(memories.visibility, "token"), eq(memories.tokenId, tokenId)),
		),
	];

	if (filters?.visibility) {
		conditions.push(eq(memories.visibility, filters.visibility));
	}
	if (filters?.user) {
		conditions.push(eq(memories.userIdentifier, filters.user));
	}

	const rows = await db
		.select({
			id: memories.id,
			summary: memories.summary,
			visibility: memories.visibility,
			user: memories.userIdentifier,
			metadata: memories.metadata,
			updatedAt: memories.updatedAt,
		})
		.from(memories)
		.where(and(...conditions))
		.orderBy(desc(memories.updatedAt))
		.limit(LIST_LIMIT);

	return {
		memories: rows.slice(0, 100),
		hasMore: rows.length > 100,
	};
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npx vitest run tests/integration/memories.test.ts`

Expected: PASS

- [ ] **Step 8: Write failing test for `readMemory`**

Add to `tests/integration/memories.test.ts`:

```typescript
it("reads a memory with visibility check", async () => {
	const { addMemory, readMemory } = await import("$lib/server/services/memories");
	const { token: token1 } = await createTestToken();
	const { token: token2 } = await createTestToken();

	const memory = await addMemory({
		tokenId: token1.id,
		userIdentifier: null,
		visibility: "token",
		summary: "Private to token1",
		content: "Secret content",
	});

	// Token1 can read its own memory
	const result1 = await readMemory(memory.id, token1.id, null);
	expect(result1).not.toBeNull();
	expect(result1!.content).toBe("Secret content");

	// Token2 cannot read token1's private memory
	const result2 = await readMemory(memory.id, token2.id, null);
	expect(result2).toBeNull();
});

it("reads org memory from any token", async () => {
	const { addMemory, readMemory } = await import("$lib/server/services/memories");
	const { token: token1 } = await createTestToken();
	const { token: token2 } = await createTestToken();

	const memory = await addMemory({
		tokenId: token1.id,
		userIdentifier: null,
		visibility: "org",
		summary: "Org fact",
		content: "Visible to all",
	});

	const result = await readMemory(memory.id, token2.id, null);
	expect(result).not.toBeNull();
	expect(result!.content).toBe("Visible to all");
});
```

- [ ] **Step 9: Implement `readMemory`**

Add to `src/lib/server/services/memories.ts`:

```typescript
export async function readMemory(
	id: string,
	tokenId: string,
	resolvedUser: string | null,
) {
	const [row] = await db
		.select()
		.from(memories)
		.where(eq(memories.id, id))
		.limit(1);

	if (!row) return null;

	// Check visibility access
	if (row.visibility === "org") return row;
	if (row.visibility === "user" && resolvedUser && row.userIdentifier === resolvedUser) return row;
	if (row.visibility === "token" && row.tokenId === tokenId) return row;

	return null;
}
```

- [ ] **Step 10: Run test to verify it passes**

Run: `npx vitest run tests/integration/memories.test.ts`

Expected: PASS

- [ ] **Step 11: Write failing test for `deleteMemory`**

Add to `tests/integration/memories.test.ts`:

```typescript
it("deletes own memory", async () => {
	const { addMemory, deleteMemory, readMemory } = await import("$lib/server/services/memories");
	const { token } = await createTestToken();

	const memory = await addMemory({
		tokenId: token.id,
		userIdentifier: null,
		visibility: "org",
		summary: "To be deleted",
		content: "Will be gone",
	});

	const result = await deleteMemory(memory.id, token.id);
	expect(result).toBe(true);

	const gone = await readMemory(memory.id, token.id, null);
	expect(gone).toBeNull();
});

it("cannot delete another token's memory", async () => {
	const { addMemory, deleteMemory } = await import("$lib/server/services/memories");
	const { token: token1 } = await createTestToken();
	const { token: token2 } = await createTestToken();

	const memory = await addMemory({
		tokenId: token1.id,
		userIdentifier: null,
		visibility: "org",
		summary: "Token1 created",
		content: "Token1 content",
	});

	const result = await deleteMemory(memory.id, token2.id);
	expect(result).toBe(false);
});
```

- [ ] **Step 12: Implement `deleteMemory`**

Add to `src/lib/server/services/memories.ts`:

```typescript
export async function deleteMemory(id: string, tokenId: string) {
	const result = await db
		.delete(memories)
		.where(and(eq(memories.id, id), eq(memories.tokenId, tokenId)))
		.returning({ id: memories.id });
	return result.length > 0;
}
```

- [ ] **Step 13: Run test to verify it passes**

Run: `npx vitest run tests/integration/memories.test.ts`

Expected: PASS

- [ ] **Step 14: Write failing test for `countMemories`**

Add to `tests/integration/memories.test.ts`:

```typescript
it("counts accessible memories", async () => {
	const { addMemory, countMemories } = await import("$lib/server/services/memories");
	const { token } = await createTestToken();

	await addMemory({ tokenId: token.id, userIdentifier: null, visibility: "org", summary: "One", content: "1" });
	await addMemory({ tokenId: token.id, userIdentifier: "matthias", visibility: "user", summary: "Two", content: "2" });
	await addMemory({ tokenId: token.id, userIdentifier: null, visibility: "token", summary: "Three", content: "3" });

	const count = await countMemories(token.id, "matthias");
	expect(count).toBe(3);
});
```

- [ ] **Step 15: Implement `countMemories`**

Add to `src/lib/server/services/memories.ts`:

```typescript
export async function countMemories(
	tokenId: string,
	resolvedUser?: string | null,
) {
	const [result] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(memories)
		.where(
			or(
				eq(memories.visibility, "org"),
				...(resolvedUser
					? [and(eq(memories.visibility, "user"), eq(memories.userIdentifier, resolvedUser))]
					: []),
				and(eq(memories.visibility, "token"), eq(memories.tokenId, tokenId)),
			),
		);
	return result.count;
}
```

- [ ] **Step 16: Run test to verify it passes**

Run: `npx vitest run tests/integration/memories.test.ts`

Expected: PASS

- [ ] **Step 17: Write failing test for user visibility error**

Add to `tests/integration/memories.test.ts`:

```typescript
it("rejects user visibility without user identifier", async () => {
	const { addMemory } = await import("$lib/server/services/memories");
	const { token } = await createTestToken();

	await expect(
		addMemory({
			tokenId: token.id,
			userIdentifier: null,
			visibility: "user",
			summary: "No user",
			content: "Should fail",
		}),
	).rejects.toThrow("user visibility requires a user identifier");
});

it("rejects summary over 500 characters", async () => {
	const { addMemory } = await import("$lib/server/services/memories");
	const { token } = await createTestToken();

	await expect(
		addMemory({
			tokenId: token.id,
			userIdentifier: null,
			visibility: "org",
			summary: "x".repeat(501),
			content: "Content",
		}),
	).rejects.toThrow("summary must be 500 characters or less");
});
```

- [ ] **Step 18: Run test — these should already pass**

Run: `npx vitest run tests/integration/memories.test.ts`

Expected: PASS (validation was added in step 3)

- [ ] **Step 19: Update test helpers**

In `tests/helpers.ts`, add `memories` import to the schema imports:

```typescript
import { tokens, targets, targetAuthMethods, tokenPermissions, users, webhookEndpoints, webhookEvents, skills, memories } from "$lib/server/db/schema";
```

In `truncateAll()`, add `await db.delete(memories);` as the **first line** (before `skills`, since memories references tokens).

- [ ] **Step 20: Run all integration tests**

Run: `npx vitest run tests/integration/`

Expected: ALL PASS

- [ ] **Step 21: Commit**

```bash
git add src/lib/server/services/memories.ts tests/integration/memories.test.ts tests/helpers.ts
git commit -m "feat(memory): add memories service with visibility-based access control"
```

---

### Task 4: MCP tools — memory_list, memory_read, memory_add, memory_delete

**Files:**
- Create: `src/lib/server/mcp/tools/memories.ts`
- Modify: `src/lib/server/mcp/server.ts`

- [ ] **Step 1: Create MCP tool handlers**

Create `src/lib/server/mcp/tools/memories.ts`:

```typescript
import type { Token } from "$lib/server/db/schema";
import { addMemory, listMemories, readMemory, deleteMemory } from "$lib/server/services/memories";

function resolveUser(token: Token, requestUser?: string): string | null {
	return token.defaultUser ?? requestUser ?? null;
}

export async function memoryList(
	token: Token,
	args: { visibility?: string; user?: string },
) {
	const resolvedUser = resolveUser(token, args.user);
	const result = await listMemories(token.id, resolvedUser, {
		visibility: args.visibility,
		user: args.user,
	});
	return result;
}

export async function memoryRead(
	token: Token,
	args: { id: string },
) {
	const resolvedUser = resolveUser(token);
	const memory = await readMemory(args.id, token.id, resolvedUser);
	if (!memory) return { error: "Memory not found or not accessible" };
	return {
		id: memory.id,
		summary: memory.summary,
		content: memory.content,
		visibility: memory.visibility,
		user: memory.userIdentifier,
		metadata: memory.metadata,
		createdAt: memory.createdAt,
		updatedAt: memory.updatedAt,
	};
}

export async function memoryAdd(
	token: Token,
	args: {
		summary: string;
		content: string;
		visibility: string;
		user?: string;
		metadata?: Record<string, unknown>;
	},
) {
	if (!args.summary || !args.content || !args.visibility) {
		return { error: "summary, content, and visibility are required" };
	}
	if (!["org", "user", "token"].includes(args.visibility)) {
		return { error: "visibility must be 'org', 'user', or 'token'" };
	}

	const resolvedUser = resolveUser(token, args.user);

	try {
		const memory = await addMemory({
			tokenId: token.id,
			userIdentifier: args.visibility === "org" ? null : resolvedUser,
			visibility: args.visibility as "org" | "user" | "token",
			summary: args.summary,
			content: args.content,
			metadata: args.metadata,
		});
		return {
			id: memory.id,
			summary: memory.summary,
			visibility: memory.visibility,
			user: memory.userIdentifier,
		};
	} catch (err) {
		return { error: err instanceof Error ? err.message : "Failed to add memory" };
	}
}

export async function memoryDelete(
	token: Token,
	args: { id: string },
) {
	const deleted = await deleteMemory(args.id, token.id);
	if (!deleted) return { error: "Memory not found or not owned by this token" };
	return { deleted: true };
}
```

- [ ] **Step 2: Register tools in MCP server**

In `src/lib/server/mcp/server.ts`, add the import:

```typescript
import { memoryList, memoryRead, memoryAdd, memoryDelete } from "./tools/memories";
```

- [ ] **Step 3: Update INSTRUCTIONS constant**

Replace the `INSTRUCTIONS` constant in `src/lib/server/mcp/server.ts`:

```typescript
const INSTRUCTIONS = `Always call discover at the start of each session to learn available targets, webhooks, and organization skills. Then call org_skill_list to see available organization skills and memory_list to load the memory index. Scan memory summaries and call memory_read for any memories relevant to the current task. Only call org_skill_read when you need a specific skill's full instructions.

Shellgate manages organization-wide skills shared across all agents — these are different from local Claude Code skills. Use org_skill_* tools for shared organization skills, and the superpowers writing-skills skill for local Claude Code skills.`;
```

- [ ] **Step 4: Add memory_list tool registration**

In `registerTools()`, add after the `org_skill_delete` registration:

```typescript
server.tool(
	"memory_list",
	`Returns a compact index of all accessible memories (id, summary, visibility, user, updatedAt). Call at session start and before memory_add to check for duplicates or memories to update. Max 100 results.

You see: all org memories, user memories matching your user, and your own token memories.`,
	{
		visibility: z.enum(["org", "user", "token"]).optional().describe("Filter by visibility level"),
		user: z.string().optional().describe("Filter by user identifier"),
	},
	async (args) => {
		const result = await memoryList(token, args);
		return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
	}
);
```

- [ ] **Step 5: Add memory_read tool registration**

```typescript
server.tool(
	"memory_read",
	"Returns the full content of a specific memory. Only fetch memories relevant to your current task — don't read everything.",
	{
		id: z.string().describe("Memory ID"),
	},
	async (args) => {
		const result = await memoryRead(token, args);
		return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
	}
);
```

- [ ] **Step 6: Add memory_add tool registration**

```typescript
server.tool(
	"memory_add",
	`Store a fact, preference, or learning. Rules:
- summary: one-line description (max 500 chars) — this is the index entry
- content: full detail — be concise but complete
- Always call memory_list first to check for existing similar memories
- If updating a fact, memory_delete the old one then memory_add the new
- One fact per memory — don't bundle unrelated things
- Write memories when you learn something useful for future sessions

Visibility guide:
- org: Facts useful to ALL team members and agents. Examples: project names & repo URLs, infra details, team conventions.
- user: Personal preferences and context for ONE person. Examples: coding style, communication preferences, role/responsibilities.
- token: Context specific to THIS agent instance only. Examples: session conclusions, task-specific learnings.

When in doubt, prefer 'user' over 'org' — easier to promote later than to clean up noise.`,
	{
		summary: z.string().describe("One-line description (max 500 chars) — the index entry"),
		content: z.string().describe("Full detail of the memory"),
		visibility: z.enum(["org", "user", "token"]).describe("Visibility level"),
		user: z.string().optional().describe("User identifier (resolved from token defaultUser if not provided)"),
		metadata: z.record(z.string(), z.unknown()).optional().describe("Arbitrary key-value metadata"),
	},
	async (args) => {
		const result = await memoryAdd(token, args);
		return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
	}
);
```

- [ ] **Step 7: Add memory_delete tool registration**

```typescript
server.tool(
	"memory_delete",
	"Delete a memory that is outdated, incorrect, or superseded. Prefer updating (delete + add) over keeping stale memories. You can only delete memories created by your token.",
	{
		id: z.string().describe("Memory ID to delete"),
	},
	async (args) => {
		const result = await memoryDelete(token, args);
		return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
	}
);
```

- [ ] **Step 8: Add memory tools to `createMcpToolHandler` switch**

In the `createMcpToolHandler` function, add these cases before the `default`:

```typescript
case "memory_list":
	return memoryList(t, args as unknown as { visibility?: string; user?: string });
case "memory_read":
	return memoryRead(t, args as unknown as { id: string });
case "memory_add":
	return memoryAdd(t, args as unknown as { summary: string; content: string; visibility: string; user?: string; metadata?: Record<string, unknown> });
case "memory_delete":
	return memoryDelete(t, args as unknown as { id: string });
```

- [ ] **Step 9: Commit**

```bash
git add src/lib/server/mcp/tools/memories.ts src/lib/server/mcp/server.ts
git commit -m "feat(memory): add 4 MCP tools (memory_list, memory_read, memory_add, memory_delete)"
```

---

### Task 5: Discovery integration — add memoryCount

**Files:**
- Modify: `src/lib/server/mcp/tools/discover.ts`

- [ ] **Step 1: Add countMemories import**

In `src/lib/server/mcp/tools/discover.ts`, add:

```typescript
import { countMemories } from "$lib/server/services/memories";
```

- [ ] **Step 2: Add memoryCount to discover response**

In the `discover` function, add after the `skills` fetch:

```typescript
const resolvedUser = token.defaultUser ?? null;
const memoryCount = await countMemories(token.id, resolvedUser);
```

Update the return to include `memoryCount`:

```typescript
return { targets, webhooks, skills, memoryCount };
```

- [ ] **Step 3: Run integration tests**

Run: `npx vitest run tests/integration/`

Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/server/mcp/tools/discover.ts
git commit -m "feat(memory): add memoryCount to discovery response"
```

---

### Task 6: Token detail page — defaultUser field

**Files:**
- Modify: `src/routes/(app)/api-keys/[id]/+page.server.ts`
- Modify: `src/routes/(app)/api-keys/[id]/+page.svelte`

- [ ] **Step 1: Add setDefaultUser action**

In `src/routes/(app)/api-keys/[id]/+page.server.ts`, add `updateDefaultUser` to the imports:

```typescript
import { getTokenById, renameToken, deleteToken, updateDefaultUser } from "$lib/server/services/tokens";
```

Add a new action in the `actions` object (after `rename`):

```typescript
setDefaultUser: async ({ request, params }) => {
	const data = await request.formData();
	const defaultUser = data.get("defaultUser")?.toString()?.trim() || null;
	if (defaultUser && defaultUser.length > 128) return fail(400, { error: "Default user must be 128 characters or less" });

	const result = await updateDefaultUser(params.id, defaultUser);
	if (!result) return fail(404, { error: "API key not found" });
	return { defaultUserSet: { id: params.id, defaultUser } };
},
```

- [ ] **Step 2: Add defaultUser to the Token type in the svelte component**

In `src/routes/(app)/api-keys/[id]/+page.svelte`, update the `Token` type:

```typescript
type Token = {
	id: string;
	name: string;
	defaultUser: string | null;
	createdAt: string | Date;
	revokedAt: string | Date | null;
	lastUsedAt: string | Date | null;
	updatedAt: string | Date;
};
```

- [ ] **Step 3: Add defaultUser display and edit form**

In `src/routes/(app)/api-keys/[id]/+page.svelte`, add state variables after the existing delete state:

```typescript
let defaultUserSubmitting = $state(false);
let editDefaultUser = $state(token.defaultUser ?? "");
```

Add a new section in the template, after the "Key Information" `</div>` and before the "Permissions" `<div>`:

```svelte
<!-- Default User -->
<div class="rounded-lg border p-6">
	<h2 class="mb-1 text-lg font-semibold">Default User</h2>
	<p class="text-muted-foreground mb-4 text-sm">
		When set, all memories created by this token are attributed to this user.
		Personal agent tokens should have this set.
	</p>
	<form
		method="POST"
		action="?/setDefaultUser"
		class="flex items-end gap-2"
		use:enhance={() => {
			defaultUserSubmitting = true;
			return async ({ result, update }) => {
				defaultUserSubmitting = false;
				if (result.type === "success" && result.data?.defaultUserSet) {
					const { defaultUser } = result.data.defaultUserSet as { id: string; defaultUser: string | null };
					localToken = { ...token, defaultUser };
					toast.success(defaultUser ? `Default user set to "${defaultUser}"` : "Default user cleared");
				} else if (result.type === "failure") {
					toast.error((result.data?.error as string) ?? "Failed to update");
				}
				await update({ reset: false, invalidateAll: false });
			};
		}}
	>
		<div class="grid flex-1 gap-2">
			<Label for="default-user">User identifier</Label>
			<Input
				id="default-user"
				name="defaultUser"
				placeholder="e.g. matthias"
				bind:value={editDefaultUser}
			/>
		</div>
		<Button type="submit" disabled={defaultUserSubmitting}>
			{#if defaultUserSubmitting}
				<LoaderCircleIcon class="mr-2 size-4 animate-spin" />
			{/if}
			Save
		</Button>
	</form>
</div>
```

- [ ] **Step 4: Verify dev server compiles**

Run: `npm run dev` and navigate to `/api-keys/[id]` to check the new section renders.

- [ ] **Step 5: Commit**

```bash
git add src/routes/\(app\)/api-keys/\[id\]/+page.server.ts src/routes/\(app\)/api-keys/\[id\]/+page.svelte
git commit -m "feat(memory): add defaultUser field to token detail page"
```

---

### Task 7: Read-only memories dashboard page

**Files:**
- Create: `src/routes/(app)/memories/+page.server.ts`
- Create: `src/routes/(app)/memories/+page.svelte`
- Modify: `src/lib/components/app-sidebar.svelte`

- [ ] **Step 1: Create page server load**

Create `src/routes/(app)/memories/+page.server.ts`:

```typescript
import type { PageServerLoad } from "./$types";
import { db } from "$lib/server/db";
import { memories, tokens } from "$lib/server/db/schema";
import { eq, desc } from "drizzle-orm";

export const load: PageServerLoad = async () => {
	const rows = await db
		.select({
			id: memories.id,
			tokenId: memories.tokenId,
			tokenName: tokens.name,
			userIdentifier: memories.userIdentifier,
			visibility: memories.visibility,
			summary: memories.summary,
			content: memories.content,
			metadata: memories.metadata,
			createdAt: memories.createdAt,
			updatedAt: memories.updatedAt,
		})
		.from(memories)
		.leftJoin(tokens, eq(memories.tokenId, tokens.id))
		.orderBy(desc(memories.updatedAt))
		.limit(500);

	return { memories: rows };
};
```

- [ ] **Step 2: Create page component**

Create `src/routes/(app)/memories/+page.svelte`:

```svelte
<script lang="ts">
	import * as Table from "$lib/components/ui/table/index.js";
	import * as Breadcrumb from "$lib/components/ui/breadcrumb/index.js";
	import { Badge } from "$lib/components/ui/badge/index.js";
	import { Input } from "$lib/components/ui/input/index.js";
	import BrainIcon from "@lucide/svelte/icons/brain";
	import type { PageData } from "./$types";

	let { data }: { data: PageData } = $props();

	type Memory = (typeof data.memories)[number];

	let search = $state("");
	let visibilityFilter = $state<string>("");

	let filtered = $derived(
		data.memories.filter((m: Memory) => {
			if (visibilityFilter && m.visibility !== visibilityFilter) return false;
			if (search) {
				const q = search.toLowerCase();
				return (
					m.summary.toLowerCase().includes(q) ||
					m.content.toLowerCase().includes(q) ||
					(m.userIdentifier?.toLowerCase().includes(q) ?? false)
				);
			}
			return true;
		}),
	);

	let expanded = $state<Set<string>>(new Set());

	function toggleExpand(id: string) {
		const next = new Set(expanded);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		expanded = next;
	}

	function visibilityColor(v: string) {
		if (v === "org") return "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300";
		if (v === "user") return "border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-950 dark:text-purple-300";
		return "border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300";
	}

	function formatDate(d: string | Date) {
		return new Date(d).toLocaleDateString("en-US", {
			month: "short",
			day: "numeric",
			year: "numeric",
		});
	}
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
					<Breadcrumb.Page>Memories</Breadcrumb.Page>
				</Breadcrumb.Item>
			</Breadcrumb.List>
		</Breadcrumb.Root>
		<h1 class="mt-1 text-2xl font-bold tracking-tight">Agent Memories</h1>
		<p class="text-muted-foreground text-sm">
			Read-only view of all memories stored by agents. Memories are created and managed via MCP tools.
		</p>
	</div>

	<!-- Filters -->
	<div class="flex gap-2">
		<Input
			placeholder="Search memories..."
			bind:value={search}
			class="max-w-sm"
		/>
		<button
			class="rounded-md border px-3 py-1.5 text-sm {visibilityFilter === '' ? 'bg-accent' : ''}"
			onclick={() => (visibilityFilter = "")}
		>All</button>
		<button
			class="rounded-md border px-3 py-1.5 text-sm {visibilityFilter === 'org' ? 'bg-accent' : ''}"
			onclick={() => (visibilityFilter = "org")}
		>Org</button>
		<button
			class="rounded-md border px-3 py-1.5 text-sm {visibilityFilter === 'user' ? 'bg-accent' : ''}"
			onclick={() => (visibilityFilter = "user")}
		>User</button>
		<button
			class="rounded-md border px-3 py-1.5 text-sm {visibilityFilter === 'token' ? 'bg-accent' : ''}"
			onclick={() => (visibilityFilter = "token")}
		>Token</button>
	</div>

	{#if filtered.length === 0}
		<div class="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed py-12">
			<BrainIcon class="text-muted-foreground size-8" />
			<p class="text-muted-foreground text-sm">
				{search || visibilityFilter ? "No memories match your filters." : "No memories yet. Agents will create them via MCP tools."}
			</p>
		</div>
	{:else}
		<div class="rounded-lg border">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>Summary</Table.Head>
						<Table.Head class="w-24">Visibility</Table.Head>
						<Table.Head class="w-32">User</Table.Head>
						<Table.Head class="w-32">Token</Table.Head>
						<Table.Head class="w-28">Updated</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each filtered as memory (memory.id)}
						<Table.Row
							class="cursor-pointer"
							onclick={() => toggleExpand(memory.id)}
						>
							<Table.Cell class="font-medium">{memory.summary}</Table.Cell>
							<Table.Cell>
								<Badge class={visibilityColor(memory.visibility)}>{memory.visibility}</Badge>
							</Table.Cell>
							<Table.Cell class="text-muted-foreground text-sm">
								{memory.userIdentifier ?? "—"}
							</Table.Cell>
							<Table.Cell class="text-muted-foreground text-sm">
								{memory.tokenName ?? "deleted"}
							</Table.Cell>
							<Table.Cell class="text-muted-foreground text-sm">
								{formatDate(memory.updatedAt)}
							</Table.Cell>
						</Table.Row>
						{#if expanded.has(memory.id)}
							<Table.Row>
								<Table.Cell colspan={5}>
									<div class="bg-muted/50 rounded-md p-4 text-sm whitespace-pre-wrap">
										{memory.content}
									</div>
									{#if memory.metadata && Object.keys(memory.metadata).length > 0}
										<div class="text-muted-foreground mt-2 text-xs">
											Metadata: {JSON.stringify(memory.metadata)}
										</div>
									{/if}
								</Table.Cell>
							</Table.Row>
						{/if}
					{/each}
				</Table.Body>
			</Table.Root>
		</div>
	{/if}
</div>
```

- [ ] **Step 3: Add "Memories" to sidebar navigation**

In `src/lib/components/app-sidebar.svelte`, update the Gateway group to include Memories:

```typescript
{
	title: "Gateway",
	items: [
		{ title: "Targets", url: "/targets" },
		{ title: "Webhooks", url: "/webhooks" },
		{ title: "Skills", url: "/skills" },
		{ title: "Memories", url: "/memories" },
	],
},
```

- [ ] **Step 4: Verify dev server compiles and page renders**

Run: `npm run dev` and navigate to `/memories`. Verify:
- Page renders with empty state
- Sidebar shows "Memories" link
- Filters work (no memories yet, but UI should render)

- [ ] **Step 5: Commit**

```bash
git add src/routes/\(app\)/memories/ src/lib/components/app-sidebar.svelte
git commit -m "feat(memory): add read-only memories dashboard page"
```

---

### Task 8: Run full test suite and verify

**Files:** None (verification only)

- [ ] **Step 1: Run all integration tests**

Run: `npx vitest run tests/integration/`

Expected: ALL PASS

- [ ] **Step 2: Run unit tests**

Run: `npx vitest run tests/unit/`

Expected: ALL PASS

- [ ] **Step 3: Verify dev server starts cleanly**

Run: `npm run dev`

Verify no compilation errors in the terminal output.

- [ ] **Step 4: Manual smoke test**

1. Navigate to `/api-keys/[id]` — verify defaultUser field shows
2. Navigate to `/memories` — verify page renders
3. Check sidebar — verify "Memories" appears in Gateway group

- [ ] **Step 5: Final commit (if any fixups needed)**

Only if test failures or compilation errors required fixes.
