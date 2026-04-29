# Shellgate Skill Registry — Design Spec

**Date:** 2026-04-29
**Linear:** DEA-4079
**Status:** Draft

## Context

Shellgate is the gateway + auth + discovery layer for We Compare's AI agents. Currently, organization-wide skills (deploy flows, code review, linear triage, etc.) have no centralized distribution mechanism. Cortex was built for this but adds unnecessary infra. Shellgate already has 90% of the puzzle: auth per agent, discovery, audit logging.

This feature adds a **skill registry** to Shellgate — a centralized store of Agent Skills spec-compliant skills that agents can discover, read, create, update, and delete via the existing API.

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| MCP transport | Not in MVP | Adds significant complexity; HTTP endpoints serve all current consumers |
| Source of skills | API-first, single source | No Git sync, no dual sources — Shellgate DB is the truth |
| Skill permissions per token | Not in MVP | All skills visible to all valid tokens |
| Agent write access | Full CRUD via bearer auth | Agents can create, update, and delete skills |
| Guard engine | Not in MVP | No approval flow for write ops |
| Skill format | Agent Skills spec (YAML frontmatter + markdown body) | Open standard, 35+ platform support |
| File bundles | Not in MVP | Only flat SKILL.md content, no scripts/references/assets |
| Search | None | Discovery catalog (name + description) suffices; agents match locally |
| Discovery | Extend `/discovery` with `skills` array | Progressive disclosure: compact catalog at session start |
| Gateway skill | Update with skill registry instructions | Agents must know how to discover and use skills |

## Data Model

### `skills` table

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK, `gen_random_uuid()` |
| `slug` | varchar(64) | unique, not null — equals `name` from frontmatter |
| `description` | varchar(1024) | not null |
| `contentMd` | text | not null — full SKILL.md including frontmatter |
| `version` | integer | not null, default 1 — auto-increments on update |
| `createdAt` | timestamp | not null, default now |
| `updatedAt` | timestamp | not null, default now |

### Validation rules (Agent Skills spec)

- `slug`: 1-64 chars, lowercase alphanumeric + hyphens, no consecutive hyphens, no leading/trailing hyphens
- `description`: 1-1024 chars, non-empty
- `contentMd`: must contain valid YAML frontmatter with `name` and `description`
- `name` in frontmatter must match `slug`

### What is explicitly excluded

- No `skill_permissions` table
- No `skill_files` table
- No `status`, `kind`, or `scope` columns

## Service Layer

### `src/lib/server/services/skills.ts`

Follows existing service pattern (targets, webhook-endpoints):

```
listSkills()              → { slug, description }[]
getSkill(slug)            → full skill record | null
createSkill(contentMd)    → skill record
updateSkill(slug, contentMd) → skill record | null
deleteSkill(slug)         → boolean
```

**Parsing logic:**
- On `create` and `update`: parse YAML frontmatter from `contentMd`
- Extract `name` → `slug`, extract `description` → `description` column
- Validate against Agent Skills spec rules
- On `update`: increment `version`

The service is the single place that parses and validates frontmatter. Routes and dashboard only call the service.

## API Routes

### Agent-facing (bearer auth via `requireBearer`) — top-level routes

| Route | Method | Purpose |
|---|---|---|
| `/skills` | GET | List all skills (slug + description) |
| `/skills/[slug]` | GET | Full SKILL.md content |
| `/skills` | POST | Create skill — body: `{ content }` |
| `/skills/[slug]` | PUT | Update skill — body: `{ content }` |
| `/skills/[slug]` | DELETE | Delete skill |

SvelteKit route files: `src/routes/skills/+server.ts`, `src/routes/skills/[slug]/+server.ts`

### Admin API (basic auth via `requireAdmin`) — under `/api/`

| Route | Method | Purpose |
|---|---|---|
| `/api/skills` | GET | List all skills |
| `/api/skills` | POST | Create skill |
| `/api/skills/[slug]` | GET | Get skill |
| `/api/skills/[slug]` | PUT | Update skill |
| `/api/skills/[slug]` | DELETE | Delete skill |

SvelteKit route files: `src/routes/api/skills/+server.ts`, `src/routes/api/skills/[slug]/+server.ts`

Both route sets call the same service functions. The only difference is the auth middleware (`requireBearer` vs `requireAdmin`).

### Response formats

**`GET /skills`** — compact catalog:
```json
{ "skills": [{ "slug": "deploy-hotfix", "description": "Deploy a hotfix..." }] }
```

**`GET /skills/[slug]`** — full record:
```json
{
  "slug": "deploy-hotfix",
  "description": "...",
  "content": "---\nname: deploy-hotfix\n...",
  "version": 3
}
```

**`POST /skills`** and **`PUT /skills/[slug]`** — body:
```json
{ "content": "---\nname: deploy-hotfix\ndescription: Deploy a hotfix...\n---\n\n## Steps\n..." }
```

On PUT: `name` in frontmatter must match the slug in the URL.

### Discovery extension

`GET /discovery` response gains a `skills` key:
```json
{
  "targets": [...],
  "webhooks": [...],
  "skills": [{ "slug": "...", "description": "..." }]
}
```

### `/api/skill` (existing)

Unchanged — this serves the Shellgate gateway skill itself, not the registry.

## Gateway Skill Update

The SKILL.md template in `src/lib/server/utils/install-scripts.ts` and `/api/skill` gets a new section instructing agents to:

1. At session start: call `GET /discovery` and read the `skills` array
2. When a task matches a skill description: call `GET /skills/{slug}` for full instructions
3. Agents can manage skills via `POST /skills`, `PUT /skills/{slug}`, `DELETE /skills/{slug}`

## Dashboard UI

Follows the `/webhooks` pattern.

### `/skills` — overview page
- Table: slug, description, version, updatedAt
- "Create skill" button → dialog/form
- Per skill: link to detail page

### `/skills/[slug]` — detail page
- SKILL.md content in a monospace textarea
- Metadata: slug, version, createdAt, updatedAt
- "Save" button (update)
- "Delete" button with confirmation

### Navigation
- New sidebar item: "Skills"

## Testing

### Integration tests (`tests/integration/skills.test.ts`)

Against real Postgres via Testcontainers:
- CRUD happy path: create → list → get → update → delete
- Validation: invalid slug, missing frontmatter, name/slug mismatch
- Version auto-increment on update
- Discovery response includes skills
- Delete of non-existent skill returns null/false

### Unit tests (`tests/unit/skill-parser.test.ts`)

Pure function tests for frontmatter parsing:
- Valid SKILL.md → slug + description
- Edge cases: consecutive hyphens, too long, uppercase, empty description

### Manual verification

After implementation: use Playwright MCP to walk through the dashboard UI and verify everything works end-to-end.

## Out of Scope (future)

- MCP transport (`/mcp` Streamable HTTP endpoint)
- Skill permissions per token (`skill_permissions` table)
- Guard engine with Telegram approval for write ops
- File bundles (`skill_files` table for scripts/references/assets)
- Full-text search on skills
- Git sync (webhook-based sync with GitLab)
