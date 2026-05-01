# Shellgate Agent Memory MVP — Design Spec

**Date:** 2026-05-01
**Linear:** DEA-4116
**Status:** Draft

## Context

All agents (Claude Code, Dagobot/OpenClaw, Codex) need **long-term memory**: facts, preferences, and context that persist across sessions. Examples:

* "Matthias prefers TypeScript over Python"
* "Sneakerbaron deploys via Coolify on Hetzner"
* "Project repo URLs: sneakerbaron → github.com/..."

Memory lives in Shellgate for the same reasons as skills: auth per agent (`sg_` tokens), MCP endpoint, and Postgres are already present. No extra service to maintain.

### Inspiration

- **Mem0:** `user_id` + `agent_id` + `org_id` scoping, embedding-based dedup (V2 for us)
- **Karpathy's LLM Wiki:** index-based navigation — compact summaries loaded at session start, full content fetched on demand. The LLM does all maintenance (write, dedup, consolidate).
- **Claude Code MEMORY.md:** pull-based model — agent decides what's relevant from a loaded index.

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Visibility model | Flat enum: `org`, `user`, `token` | Three clear levels covering all use cases; simpler than namespace paths |
| User identity | `defaultUser` field on tokens table | Server-side binding — personal tokens always resolve to correct user, no agent trust needed |
| Retrieval pattern | Index + detail (two-layer) | `memory_list` returns summaries only; `memory_read` fetches full content. Scales to hundreds of memories without context bloat |
| Deduplication | Agent-side via tool instructions | The calling LLM is already AI — it checks `memory_list` before adding. Server-side embedding dedup is V2 |
| Search | None (MVP) | At <200 memories, index scan suffices. Embedding search (`pgvector`) is V2 |
| Content validation | Max 500 chars on summary, no hard limit on content | Instructions guide concise writing; summary limit enforces index compactness |
| List limit | Max 100 memories returned | Hard cap with `hasMore` flag. Signals when V2 (semantic search) is needed |
| Dashboard | Read-only | Agents own memory CRUD; dashboard is for monitoring/debugging |
| Discovery | Add `memoryCount` to response | Lightweight hint without loading memories |

## Data Model

### `tokens` table — new column

| Column | Type | Constraints |
|---|---|---|
| `defaultUser` | varchar(128) | nullable — set via dashboard for identity binding |

**Enforcement logic:**
- Token has `defaultUser` → always used, parameter ignored (foolproof for personal tokens)
- Token has no `defaultUser` → agent-provided `user` parameter is used (for shared tokens like Dagobot)
- `visibility: "user"` without resolvable user → error

### `memories` table — new

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK, `gen_random_uuid()` |
| `tokenId` | uuid | not null, FK → `tokens.id` ON DELETE CASCADE |
| `userIdentifier` | varchar(128) | nullable — resolved from `defaultUser` or parameter |
| `visibility` | varchar(16) | not null — `'org'` \| `'user'` \| `'token'` |
| `summary` | varchar(500) | not null — one-line index entry |
| `content` | text | not null — full detail |
| `metadata` | jsonb | default `{}` — arbitrary key-value pairs |
| `createdAt` | timestamptz | not null, default now |
| `updatedAt` | timestamptz | not null, default now |

### Indexes

| Index | Columns | Purpose |
|---|---|---|
| `idx_memories_token` | `tokenId` | Filter by owning token |
| `idx_memories_visibility` | `visibility` | Filter by level |
| `idx_memories_user` | `userIdentifier` | Filter by user |

### Visibility query logic

```sql
WHERE
  visibility = 'org'
  OR (visibility = 'user' AND user_identifier = :resolvedUser)
  OR (visibility = 'token' AND token_id = :tokenId)
ORDER BY updated_at DESC
LIMIT 101  -- 100 + 1 to detect hasMore
```

`:resolvedUser` is determined from the token's `defaultUser` or the request parameter.

### Cascade behavior

Token deleted → all its memories deleted. Consistent with permissions and webhook endpoints.

## MCP Tools

### 4 tools

| Tool | Parameters | Returns |
|---|---|---|
| `memory_list` | `visibility?`, `user?` | Array of `{ id, summary, visibility, user, metadata, updatedAt }` + `hasMore` flag. Max 100 entries. Optional filters narrow results within accessible memories. |
| `memory_read` | `id` | Full memory: `{ id, summary, content, visibility, user, metadata, createdAt, updatedAt }` |
| `memory_add` | `summary`, `content`, `visibility`, `user?`, `metadata?` | Created memory object |
| `memory_delete` | `id` | `{ deleted: true }` |

### Tool descriptions (MCP)

**`memory_list`:**
```
Returns a compact index of all accessible memories (id, summary, visibility,
user, updatedAt). Call at session start and before memory_add to check for
duplicates or memories to update. Max 100 results.

You see: all org memories, user memories matching your user, and your own
token memories.
```

**`memory_read`:**
```
Returns the full content of a specific memory. Only fetch memories relevant
to your current task — don't read everything.
```

**`memory_add`:**
```
Store a fact, preference, or learning. Rules:
- summary: one-line description (max 500 chars) — this is the index entry
- content: full detail — be concise but complete
- Always call memory_list first to check for existing similar memories
- If updating a fact, memory_delete the old one then memory_add the new
- One fact per memory — don't bundle unrelated things
- Write memories when you learn something useful for future sessions

Visibility guide:
- org: Facts useful to ALL team members and agents.
  Examples: project names & repo URLs, infra details, team conventions.
- user: Personal preferences and context for ONE person.
  Examples: coding style, communication preferences, role/responsibilities.
- token: Context specific to THIS agent instance only.
  Examples: session conclusions, task-specific learnings.

When in doubt, prefer 'user' over 'org' — easier to promote later than to
clean up noise.
```

**`memory_delete`:**
```
Delete a memory that is outdated, incorrect, or superseded.
Prefer updating (delete + add) over keeping stale memories.
```

### MCP server instructions update

```
Always call discover at the start of each session to learn available targets,
webhooks, and organization skills. Then call org_skill_list to see available
organization skills and memory_list to load the memory index. Scan memory
summaries and call memory_read for any memories relevant to the current task.
Only call org_skill_read when you need a specific skill's full instructions.
```

## Service Layer

### `src/lib/server/services/memories.ts`

Follows existing service pattern (skills, webhook-endpoints):

| Function | Signature | Notes |
|---|---|---|
| `listMemories` | `(tokenId, resolvedUser?) → Memory[]` | Visibility query (org + user + token), ordered by `updatedAt` desc, limit 101 |
| `readMemory` | `(id, tokenId, resolvedUser?) → Memory \| null` | Single fetch with visibility check — must be accessible to this token/user |
| `addMemory` | `(data: AddMemoryInput) → Memory` | Insert with resolved user from token's `defaultUser` or parameter |
| `deleteMemory` | `(id, tokenId) → boolean` | Only delete memories created by this token (regardless of visibility level) |
| `countMemories` | `(tokenId, resolvedUser?) → number` | For discovery endpoint |

**User resolution helper:**

```typescript
function resolveUser(token: Token, requestUser?: string): string | null {
  return token.defaultUser ?? requestUser ?? null;
}
```

### `src/lib/server/mcp/tools/memories.ts`

4 tool handlers, following the same pattern as `tools/skills.ts`. Each resolves the user from token + parameter before calling the service.

## Discovery Integration

`GET /discovery` response adds:

```json
{
  "targets": [...],
  "webhookEndpoints": [...],
  "skills": [...],
  "memoryCount": 42
}
```

## Dashboard

### Route: `/memories` (read-only)

| Element | Description |
|---|---|
| Table | All memories, sortable by date |
| Filters | Visibility (org/user/token), user, token |
| Search | Text search on summary and content |
| Detail | Click to expand: full content, metadata, timestamps |
| Badges | Visibility level color-coded |

No create/edit/delete in dashboard — agents own memory CRUD.

### Route: `/api-keys/[id]` — update

Show `defaultUser` field on token detail page, editable. Simple text input.

## Files

| File | Action |
|---|---|
| `src/lib/server/db/schema.ts` | Add `memories` table, add `defaultUser` to `tokens` |
| `src/lib/server/services/memories.ts` | New: CRUD + visibility query service |
| `src/lib/server/mcp/tools/memories.ts` | New: 4 MCP tool handlers |
| `src/lib/server/mcp/server.ts` | Register memory tools, update instructions |
| `src/routes/(app)/memories/+page.svelte` | New: read-only dashboard page |
| `src/routes/(app)/memories/+page.server.ts` | New: load all memories |
| `src/routes/(app)/api-keys/[id]/+page.svelte` | Update: show `defaultUser` field |
| `src/routes/(app)/api-keys/[id]/+page.server.ts` | Update: handle `defaultUser` save |
| `tests/integration/memories.test.ts` | New: service integration tests |

## Migration Path to V2

When `memory_list` consistently returns `hasMore: true`:

1. `ALTER TABLE memories ADD COLUMN embedding vector(1536)`
2. Add `memory_search(query, limit?)` tool — cosine similarity via pgvector
3. Embed via OpenAI text-embedding-3-small
4. Server-side dedup: cosine >0.92 = update instead of insert
5. Add `expires_at`, `lastAccessedAt` for memory decay
6. Consolidation: async job that merges related memories

Existing tools remain unchanged — no breaking changes.

## What is explicitly excluded from MVP

- Embedding/vector search (V2)
- Server-side deduplication (V2)
- Memory consolidation/merging (V2)
- Memory expiration/decay (V2)
- `allowedUsers` whitelist on tokens (can be added if needed)
- Memory permissions per token (all accessible memories are visible)
- Edit/create/delete in dashboard (agents only)
