# Vault & Blind-Fill Design

**Date:** 2026-05-07
**Status:** Draft

## Problem

AI agents (Claude Code) sometimes need to fill passwords and credentials into websites via Playwright browser automation. Currently, the agent must receive the plaintext value to fill it, which means the secret appears in the agent's context, conversation history, and logs.

The goal: agents can **use** secrets (fill them into browser fields) without ever **reading** them.

## Solution Overview

Two components working together:

1. **Shellgate Vaults (remote)** — encrypted secret storage with search, ACLs, and audit logging
2. **Local Blind-Fill MCP (local)** — small Node script that fetches secrets from Shellgate and injects them into the browser via CDP, returning only success/failure to the agent

The agent never sees sensitive values. It works with opaque handles and delegates the actual fill to the local trusted component.

## Architecture

```
Claude Code (agent)
  ├── Shellgate MCP (remote)
  │     └── vault_search → returns handles + non-sensitive fields
  ├── Shellgate Secrets MCP (local)
  │     └── blind_fill(handle, field, selector)
  │           ├── fetches value from Shellgate internal endpoint
  │           ├── verifies browser origin against allowedOrigins
  │           ├── injects into DOM via CDP
  │           └── returns { filled: true }
  └── Playwright MCP (local)
        └── navigate, click, screenshot, etc.
```

### Security Boundary

This is an **anti-logging** boundary: the secret does not appear in agent context or logs. It is NOT a hard boundary — the agent could theoretically read values back from the DOM via Playwright's evaluate tool. A hard boundary (wrapping Playwright, taint tracking) is a future upgrade path.

## Data Model

### New Tables

```sql
-- Vaults group related credentials
vaults
  id            UUID PRIMARY KEY
  name          TEXT NOT NULL          -- "Production Credentials"
  slug          TEXT UNIQUE NOT NULL   -- URL-safe identifier
  description   TEXT                   -- optional context
  createdAt     TIMESTAMP
  updatedAt     TIMESTAMP

-- Items represent a single credential set (e.g., a login)
vault_items
  id              UUID PRIMARY KEY
  vaultId         FK → vaults (cascade delete)
  name            TEXT NOT NULL        -- "GitHub Login"
  slug            TEXT NOT NULL        -- unique within vault
  domain          TEXT                 -- "github.com" (primary search key)
  description     TEXT                 -- "Org account matthias"
  allowedOrigins  JSONB               -- ["https://github.com/*"] (security enforcement)
  createdAt       TIMESTAMP
  updatedAt       TIMESTAMP
  UNIQUE(vaultId, slug)

-- Fields hold individual values within an item
vault_item_fields
  id              UUID PRIMARY KEY
  itemId          FK → vault_items (cascade delete)
  name            TEXT NOT NULL        -- "username", "password", "totp_seed"
  encryptedValue  TEXT NOT NULL        -- iv:ciphertext:authTag (base64)
  sensitive       BOOLEAN DEFAULT true -- false = value visible to agent
  sortOrder       INTEGER DEFAULT 0
  UNIQUE(itemId, name)

-- Token access to vaults (like token_permissions for targets)
token_vault_permissions
  tokenId   FK → tokens (cascade delete)
  vaultId   FK → vaults (cascade delete)
  UNIQUE(tokenId, vaultId)
```

### Relationship to Existing Model

```
tokens ──┐
         ├── token_permissions (target access, existing)
         ├── token_vault_permissions (vault access, new)
targets ──┘
vaults ──── vault_items ──── vault_item_fields
```

### Domain vs AllowedOrigins

- `domain` is the human-readable search key ("github.com", "ing.nl")
- `allowedOrigins` is the security enforcement (can be broader, e.g., `["https://*.github.com/*"]`)
- Admin UI auto-populates `allowedOrigins` from `domain` on create, but allows manual override

### Handle Format

Items are referenced by `vault-slug/item-slug`, e.g., `production/github`. Readable, unique, no UUIDs in the agent flow.

## Encryption

Field values are encrypted with AES-256-GCM using `node:crypto`. No extra dependencies.

```
VAULT_ENCRYPTION_KEY=<base64-encoded-32-byte-key>  (env var, required if vaults are used)
```

Storage format in `encryptedValue`:
```
<iv-base64>:<ciphertext-base64>:<authTag-base64>
```

Each field gets its own random IV. Encrypt/decrypt functions live in `src/lib/server/utils/crypto.ts`.

Key rotation and per-vault keys are out of scope for MVP.

## API Surface

### Shellgate Remote MCP — New Tools

| Tool | Input | Output | Description |
|---|---|---|---|
| `vault_search` | `query: string` | Matched items with non-sensitive field values | Searches name, domain, description, non-sensitive fields |

- Only returns items from vaults the token has permission for
- Sensitive fields show name only (no value)
- Non-sensitive fields (e.g., username) include the decrypted value

### Shellgate Internal Endpoint (NOT an MCP tool)

```
GET /api/vault-items/:vaultSlug/:itemSlug/fields/:fieldName/value
Authorization: Bearer sg_...
→ { value: "the-plaintext-value" }
```

- Checks token + vault permission
- Only returns sensitive field values
- Logs every access to audit_logs
- Intended only for the local blind-fill MCP, not for the agent

### Local Blind-Fill MCP — Tools

| Tool | Input | Output | Description |
|---|---|---|---|
| `blind_fill` | `handle`, `field`, `selector` | `{ filled: true, origin: "github.com" }` | Fill a sensitive field into a browser element |
| `blind_type` | `handle`, `field` | `{ typed: true }` | Type a sensitive value (for fields without a stable selector, e.g., 2FA popups) |

#### blind_fill Internal Flow

1. Get current browser page URL via CDP
2. Parse origin, match against item's `allowedOrigins`
3. On mismatch → refuse, log `origin_mismatch` to audit
4. Fetch value from Shellgate internal endpoint
5. Inject into DOM element via CDP `Runtime.evaluate`
6. Clear value from memory
7. Return only success/failure + origin

## Dashboard Admin UI

### New Pages

| Route | Function |
|---|---|
| `/vaults` | List vaults, create/delete |
| `/vaults/[slug]` | Vault detail: list items, create/delete items |
| `/vaults/[slug]/[itemSlug]` | Item detail: manage fields |

### Field UX (Password Manager Style)

- Sensitive fields display `••••••••` by default
- Eye icon toggle to reveal (auto-hide after timeout)
- Inline edit for all fields
- Copy-to-clipboard button (auto-clear clipboard after 30 seconds)
- Decrypt calls go through dashboard session-auth API routes (not the bearer-auth internal endpoint)

### Existing Page Changes

| Route | Change |
|---|---|
| `/api-keys/[id]` | Add vault permissions section (same pattern as target permissions) |

## Installer Integration

The existing `POST /api/install/claude-code` endpoint gains an optional `features` parameter:

```json
{ "features": ["secrets"] }
```

When `secrets` is included, the installer:
1. Configures the remote Shellgate MCP (as now)
2. Additionally configures a `shellgate-secrets` local MCP server in `settings.json`
3. Installs/updates the local blind-fill Node script

Clients that don't use browser automation (pure API/SSH) are unaffected — the feature is opt-in.

## Audit Logging

All vault operations are logged in the existing `audit_logs` table:

| Event | What's Logged |
|---|---|
| `vault_search` | Token, query string |
| `blind_fill` | Token, item handle, field name, origin, success/failure |
| `secret_value_fetch` | Token, item handle, field name |
| `origin_mismatch` | Token, item handle, attempted origin vs allowed origins |

The secret value itself is **never** logged.

## Out of Scope (MVP)

- Encryption key rotation
- Per-vault encryption keys
- Taint tracking / DOM read blocking (hard security boundary)
- TOTP code generation (seed is stored but generation requires separate mechanism)
- Secret sharing between organizations
- Browser extension approach
- Playwright storage state management

## Future Upgrade Path

### Hard Security Boundary

Replace stock Playwright MCP with a wrapped version that:
- Tracks which fields received secret values (taint tracking)
- Blocks `evaluate` calls that read tainted field values
- Redacts tainted field values from snapshots and screenshots
- Domain-locks navigation after a secret fill until form submit

This is a significant effort but the `blind_fill` API and data model remain unchanged.
