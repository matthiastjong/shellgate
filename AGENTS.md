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
```

### Key services

| Service | Purpose |
|---|---|
| `targets` | CRUD for API and SSH targets |
| `tokens` | API key generation, hashing, revocation |
| `permissions` | Token ↔ target access control |
| `auth-methods` | Credentials stored per target (bearer, basic, custom_header, ssh_key) |
| `gateway` | Proxy logic: resolve target, inject auth, forward request |
| `ssh` | SSH command execution via `ssh2` |
| `audit` | Request logging to `audit_logs` table |
| `users` | Dashboard user management (email + password) |

### Data model

```
tokens ──┐
         ├── token_permissions (unique: token + target)
targets ──┘
  │
  └── target_auth_methods (one default per target)

users (dashboard login)
audit_logs (every gateway + SSH request)
```

- Targets have `type: "api" | "ssh"`. API targets have `baseUrl`, SSH targets have `config` (JSONB: host, port, username).
- Cascade deletes: deleting a target removes its auth methods and permissions.
- Auth method types: `bearer`, `basic`, `custom_header`, `ssh_key`.

### Agent-facing routes

These are NOT behind dashboard auth — they use bearer token auth (`requireBearer`):

| Route | Purpose |
|---|---|
| `GET /discovery` | List targets accessible to this token |
| `ALL /gateway/[target]/[...path]` | Proxy HTTP to upstream API, inject stored credentials |
| `POST /ssh/[target]/exec` | Execute command on SSH target, return stdout/stderr/exitCode |
| `GET /health` | Health check |
| `GET /verify-connection` | Connection verification for agent setup |
| `GET /api/skill` | Returns OpenClaw skill YAML |
| `POST /api/install/openclaw` | OpenClaw integration installer |
| `POST /api/install/claude-code` | Claude Code integration installer |

### Dashboard routes

Behind session auth (cookie-based):

| Route | Purpose |
|---|---|
| `/` | Dashboard overview (stats) |
| `/targets` | Manage API + SSH targets |
| `/targets/[slug]` | Target detail + auth methods |
| `/api-keys` | Manage agent tokens + permissions |
| `/api-keys/[id]` | Token detail |
| `/logs` | Audit log viewer |
| `/connect` | Agent connection flow |
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

## Code patterns

- **Services** return `null` for not-found (not throw). API routes throw `error(404, ...)`.
- **Forms** use `use:enhance` with `invalidateAll: false` + local state updates.
- **Dates** from Drizzle are `string | Date` — handle both in components. Use `formatDate` for SSR-safe rendering.
- **DB** uses lazy proxy pattern — setting `DATABASE_URL` before first access is sufficient.
- **Hooks** (`hooks.server.ts`) run migrations on startup and handle auth routing (skip auth for `/api/`, `/gateway/`, `/ssh/`, `/discovery`).
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
