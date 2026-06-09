# Development Guidelines

## Architecture

Shellgate is a SvelteKit monolith — dashboard + API + gateway in one process.

### Layers

```
src/lib/server/services/   ← All business logic lives here
src/lib/server/utils/       ← Pure helpers (CIDR, URL validation, etc.)
src/routes/api/             ← Admin API (thin wrappers calling services)
src/routes/(app)/           ← Dashboard pages (call services directly, no HTTP to self)
src/routes/gateway/         ← Agent-facing: HTTP proxy to upstream APIs
src/routes/ssh/             ← Agent-facing: SSH command execution
src/routes/discovery/       ← Agent-facing: list accessible targets
src/routes/bootstrap/       ← Agent-facing: full session-start context (REST)
```

### Key services

| Service | Purpose |
|---|---|
| `targets` | CRUD for API, SSH, and email targets |
| `tokens` | API key generation, hashing, revocation |
| `permissions` | Token ↔ target access control |
| `auth-methods` | Credentials stored per target (bearer, basic, custom_header, ssh_key, imap_smtp) |
| `gateway` | Proxy logic: resolve target, inject auth, forward request |
| `ssh` | SSH command execution via `ssh2` |
| `mail` | Email operations via ImapFlow (IMAP) + Nodemailer (SMTP) |
| `audit` | Request logging to `audit_logs` table |
| `users` | Dashboard user management (email + password) |
| `webhook-endpoints` | CRUD for incoming webhook endpoint registrations |
| `webhook-events` | Event creation, polling, ACK, cleanup |

### Data model

```
tokens ──┐
         ├── token_permissions (unique: token + target)
targets ──┘
  │
  └── target_auth_methods (one default per target)

tokens ──── webhook_endpoints (one token can have multiple endpoints)
              │
              └── webhook_events (pending/delivered/expired)

users (dashboard login)
audit_logs (every gateway + SSH + mail request)
```

- Targets have `type: "api" | "ssh" | "email"`. API targets have `baseUrl`, SSH targets have `config` (JSONB: host, port, username), email targets have `config` (JSONB: imap + smtp server settings) and `email` (mailbox address).
- Cascade deletes: deleting a target removes its auth methods and permissions.
- Auth method types: `bearer`, `basic`, `custom_header`, `query_param`, `ssh_key`, `jwt_es256`, `oauth2_refresh_token`, `json_body`, `imap_smtp`.
- Webhook endpoints are linked to tokens (agents), not targets. Each endpoint has a unique slug for its public URL.
- Webhook events expire after 7 days. Agents poll and ACK events.
- Webhook endpoints have optional `handlingInstructions` (plain text) that agents receive in the poll response.

### Agent-facing routes

These are NOT behind dashboard auth — they use bearer token auth (`requireBearer`):

| Route | Purpose |
|---|---|
| `GET /bootstrap` | Full session-start context: targets, skills, webhooks, memories, wiki pages |
| `GET /discovery` | List targets accessible to this token |
| `ALL /gateway/[target]/[...path]` | Proxy HTTP to upstream API, inject stored credentials |
| `POST /ssh/[target]/exec` | Execute command on SSH target, return stdout/stderr/exitCode |
| `POST /mail/[target]/search` | Search emails in a mailbox |
| `GET /mail/[target]/message/[id]` | Read full email by UID |
| `GET /mail/[target]/message/[id]/attachment/[partId]` | Download email attachment |
| `POST /mail/[target]/send` | Send email (requires approval) |
| `POST /mail/[target]/draft` | Create draft email |
| `GET /mail/[target]/folders` | List mailbox folders |
| `POST /mail/[target]/move` | Move email to folder |
| `POST /mail/[target]/flag` | Set/unset email flags |
| `GET /health` | Health check |
| `GET /verify-connection` | Connection verification for agent setup |
| `GET /api/skill` | Returns OpenClaw skill YAML |
| `POST /api/install/openclaw` | OpenClaw integration installer |
| `POST /api/install/claude-code` | Claude Code integration installer |
| `POST /api/install/codex` | Codex CLI integration installer |
| `POST /webhooks/incoming/[slug]` | Receive webhook from external service |
| `GET /webhooks/poll` | Poll pending webhook events for this token |
| `POST /webhooks/ack` | Acknowledge processed webhook events |
| `POST /webhooks/endpoints/[id]/instructions` | Save handling instructions for endpoint |
| `POST /mcp` | MCP server (Streamable HTTP transport) |

### Dashboard routes

Behind session auth (cookie-based):

| Route | Purpose |
|---|---|
| `/` | Dashboard overview (stats) |
| `/targets` | Manage API + SSH + email targets |
| `/targets/[slug]` | Target detail + auth methods |
| `/api-keys` | Manage agent tokens + permissions |
| `/api-keys/[id]` | Token detail |
| `/logs` | Audit log viewer |
| `/connect` | Agent connection flow |
| `/webhooks` | Manage incoming webhook endpoints |
| `/webhooks/[id]` | Webhook detail + events + handling instructions |
| `/settings` | App settings |
| `/setup` | First-run user creation |
| `/onboarding` | Post-setup: create first token |

## Request flow

### Gateway proxy
1. `requireBearer` → validate token hash, check not revoked
2. IP whitelist check (if `allowedIps` set on token)
3. Resolve target by slug, check enabled
4. Check `token_permissions` for access
5. Look up default auth method → inject into upstream headers
6. Forward request to `target.baseUrl + path`
7. Log to `audit_logs`

### SSH execution
1. Same auth + permission flow as gateway
2. Validate target type is `ssh`, has config (host/username)
3. Require default auth method with type `ssh_key`
4. Parse `{ command, timeout? }` from request body
5. Connect via `ssh2`, execute, return `{ stdout, stderr, exitCode, durationMs }`
6. Log to `audit_logs`

### Mail operations
1. Same auth + permission flow as gateway
2. Validate target type is `email`, has IMAP/SMTP config
3. Require default auth method with type `imap_smtp`
4. Connect via ImapFlow (IMAP) or Nodemailer (SMTP) per request
5. Execute operation (search, read, send, draft, folders, move, flag, attachment)
6. `mail_send` requires explicit approval (hardcoded, not via guard engine)
7. Log to `audit_logs` with type `mail`

### MCP Server

Shellgate exposes all agent-facing functionality as an MCP server at `POST /mcp` using Streamable HTTP transport. Claude Code connects via `mcpServers` config in `~/.claude/settings.json`.

**Tools:** `bootstrap`, `discover` (alias), `api_request`, `api_download`, `ssh_exec`, `mail_search`, `mail_read`, `mail_attachment`, `mail_send`, `mail_draft`, `mail_folders`, `mail_move`, `mail_flag`, `webhook_poll`, `webhook_ack`, `org_skill_list`, `org_skill_read`, `org_skill_upsert`, `org_skill_delete`, `memory_list`, `memory_read`, `memory_add`, `memory_delete`, `wiki_list_pages`, `wiki_read_page`, `wiki_upsert_page`, `wiki_delete_page`, `wiki_lint_page`, `vault_search`

**Auth:** Same bearer token as REST endpoints. Passed via `Authorization` header.

**Bootstrap:** The `bootstrap` tool returns all organization context (targets, skills, memories, wiki pages, vaults). Agents should call it at session start or rely on context from their SessionStart hook.

## Testing

Diamond model: few unit tests, strong integration tests, minimal e2e.

### What to test
- Business logic with real consequences: gateway proxy, cascade deletes, default-auth-method toggling, permission uniqueness
- Edge cases in pure functions (already in `tests/unit/`)

### What NOT to test
- Simple CRUD that just verifies Drizzle INSERT + SELECT
- Route handlers (thin wrappers)
- UI components

### How to test
- Integration tests use real Postgres via **Testcontainers**
- Only mock `globalThis.fetch` (for upstream API calls in gateway tests)
- Never mock the database
- Each test gets clean state (`truncateAll` in `beforeEach`)

```
tests/
  setup.ts              ← Testcontainers global setup
  helpers.ts            ← Factory functions + truncateAll
  unit/                 ← Pure function tests
  integration/          ← Service tests against real DB
```

## Database Migrations

Shellgate uses **runtime migrations** — not `drizzle-kit push`.

### How it works
- `hooks.server.ts` calls `runMigrations()` on app startup
- Migrations are SQL files in `drizzle/` generated by Drizzle Kit
- The app blocks all requests until migrations complete
- Migrations are tracked in a database table, only new ones run

### When you change the schema
1. Edit `src/lib/server/db/schema.ts`
2. Run `npm run db:generate` to create a new migration file in `drizzle/`
3. **Commit the migration file** — it must be in git for deployment
4. The next app startup applies it automatically

### Commands
- `npm run db:generate` — generate migration from schema diff
- `npm run db:push` — push schema directly (dev only, skips migrations)
- `npm run db:studio` — visual DB editor
- `npm run db:reset` — reset DB and re-run all migrations

**Important:** Never use `drizzle-kit push` in production. Always generate and commit migration files.

## Bootstrap prompt

When adding new agent-facing features or data types to Shellgate, always check whether the `/bootstrap` endpoint response should be updated to include the new data. The bootstrap endpoint provides the complete session-start context for agents — if agents need to know about it at session start, it belongs in the bootstrap response.

## Code patterns

- **Services** return `null` for not-found (not throw). API routes throw `error(404, ...)`.
- **Forms** use `use:enhance` with `invalidateAll: false` + local state updates.
- **Dates** from Drizzle are `string | Date` — handle both in components. Use `formatDate` for SSR-safe rendering.
- **DB** uses lazy proxy pattern — setting `DATABASE_URL` before first access is sufficient.
- **Hooks** (`hooks.server.ts`) run migrations on startup and handle auth routing (skip auth for `/api/`, `/gateway/`, `/ssh/`, `/mail/`, `/discovery`).
- **Onboarding flow**: no users → `/setup`, no tokens → `/onboarding`.

## Stack

| Layer | Tech |
|---|---|
| Framework | SvelteKit |
| Runtime | Node.js |
| Database | PostgreSQL + Drizzle ORM |
| UI | shadcn-svelte + Tailwind |
| SSH | `ssh2` library |
| Auth (dashboard) | Cookie sessions, `SESSION_SECRET` |
| Auth (agents) | Bearer tokens (`sg_` prefix, SHA-256 hashed) |
| Testing | Vitest + Testcontainers |
| Deploy | Docker (single image) |
