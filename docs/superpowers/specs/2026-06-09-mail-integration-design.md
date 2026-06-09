# Mail Integration Design

**Date:** 2026-06-09
**Linear:** DEA-4688

## Goal

Give Shellgate agents full email access — search, read, send, draft, manage folders and flags — via a unified mail service built into Shellgate. No external services required.

## Decision: Build in Shellgate with ImapFlow + Nodemailer

**Rejected alternatives:**
- **EmailEngine** — $995/year, overkill for our usage
- **IMAP API (open-source fork)** — unmaintained, extra infra to run
- **Direct IMAP proxy in gateway** — IMAP is stateful TCP, doesn't fit HTTP proxy model; connect-per-request without pooling is too slow without a proper abstraction

**Chosen approach:** New `mail` service inside Shellgate using ImapFlow (IMAP) and Nodemailer (SMTP). These are the same battle-tested libraries that power EmailEngine. Connect-per-request in V1, connection pooling as later optimization if needed.

## Data Model

### Target type `email`

The `targets` table gets a new type value `email`. Email targets store IMAP and SMTP server config in the existing `config` JSONB column, plus a dedicated `email` field for the mailbox address.

```
targets
  type: "email"
  slug: "info-at-deal"
  email: "info@deal.nl"              ← new column, required for email targets
  config: {
    imap: { host, port, secure },    ← secure: true = SSL/TLS, false = STARTTLS/none
    smtp: { host, port, secure }
  }
```

### Auth method type `imap_smtp`

New auth method type for email credentials:

```
target_auth_methods
  type: "imap_smtp"
  credential: {
    username: "info@deal.nl",
    password: "app-password"
  }
```

Username and password are shared between IMAP and SMTP (standard for all providers).

### Permissions

Existing `token_permissions` model — no changes needed. A token gets access to specific email targets the same way it gets access to API/SSH targets.

### Schema changes

- Add `email` column to `targets` table (nullable, required when type = `email`)
- Extend `targets.type` TypeScript union from `"api" | "ssh"` to `"api" | "ssh" | "email"`
- Create `EmailConfig` type and update `config` column type to `SshConfig | EmailConfig | null`
- Add `"imap_smtp"` to `VALID_TYPES` in `auth-methods.ts` + new `credentialHint` branch
- Add `"mail"` to audit log `type` union in schema and `audit.ts` service
- Migration file generated via `npm run db:generate`

### Dependencies

```bash
npm install imapflow nodemailer @types/nodemailer
```

## Routes

New route tree `src/routes/mail/[target]/` using the same auth flow as gateway routes (`requireBearer` + permission check). Message `[id]` in all routes refers to IMAP UID (stable across sessions), not sequence numbers.

| Route | Method | Purpose |
|---|---|---|
| `/mail/[target]/search` | POST | Search emails by query, folder, limit |
| `/mail/[target]/message/[id]` | GET | Read full email (body, headers, attachment metadata) |
| `/mail/[target]/message/[id]/attachment/[partId]` | GET | Download specific attachment by MIME part ID |
| `/mail/[target]/send` | POST | Send email (approval required) |
| `/mail/[target]/draft` | POST | Create draft in Drafts folder |
| `/mail/[target]/folders` | GET | List all folders/labels |
| `/mail/[target]/move` | POST | Move message to another folder |
| `/mail/[target]/flag` | POST | Set/unset flags (read, starred, etc.) |

### Request/response shapes

**POST /mail/[target]/search**
```json
// Request
{
  "folder": "INBOX",
  "query": { "from": "klant@example.com", "since": "2026-06-01", "subject": "factuur" },
  "limit": 20
}
// Response
[
  { "id": "123", "uid": 456, "from": "klant@example.com", "to": ["info@deal.nl"],
    "subject": "Factuur maart", "date": "2026-06-01T10:00:00Z",
    "flags": ["\\Seen"], "hasAttachments": true }
]
```

**GET /mail/[target]/message/[id]**
```json
// Response
{
  "id": "123", "uid": 456,
  "from": "klant@example.com", "to": ["info@deal.nl"], "cc": [],
  "subject": "Factuur maart", "date": "2026-06-01T10:00:00Z",
  "text": "Platte tekst body", "html": "<p>HTML body</p>",
  "flags": ["\\Seen"],
  "attachments": [
    { "partId": "2", "filename": "factuur-maart.pdf", "contentType": "application/pdf", "size": 84210 }
  ]
}
```

**GET /mail/[target]/message/[id]/attachment/[partId]**
- Returns raw binary with `Content-Type` and `Content-Disposition` headers
- Same pattern as `api_download` for Linear uploads

**POST /mail/[target]/send**
```json
// Request
{
  "to": ["klant@example.com"],
  "cc": [],
  "bcc": [],
  "subject": "Re: Bestelling #123",
  "text": "Platte tekst",
  "html": "<p>HTML body</p>",
  "inReplyTo": "<message-id>"
}
// Response
{ "messageId": "<generated-message-id>" }
```

**POST /mail/[target]/draft**
```json
// Request
{
  "to": ["klant@example.com"],
  "subject": "Concept mail",
  "text": "Dit is een draft"
}
// Response
{ "uid": 789 }
```

**GET /mail/[target]/folders**
```json
// Response
[
  { "path": "INBOX", "name": "Inbox", "specialUse": "\\Inbox", "delimiter": "/" },
  { "path": "Drafts", "name": "Drafts", "specialUse": "\\Drafts", "delimiter": "/" },
  { "path": "Sent", "name": "Sent", "specialUse": "\\Sent", "delimiter": "/" }
]
```

**POST /mail/[target]/move**
```json
{ "id": "123", "from": "INBOX", "to": "Archive" }
```

**POST /mail/[target]/flag**
```json
{ "id": "123", "folder": "INBOX", "add": ["\\Seen"], "remove": ["\\Flagged"] }
```

### Approval flow for send

`mail_send` hardcodes an approval requirement (does NOT use the guard engine, which is designed for HTTP proxy requests). First call always returns `{ "status": "approval_required", "reason": "About to send email to klant@example.com" }`. Agent must re-call with `approved: true` after user confirms.

## MCP Tools

| Tool | Route | Description |
|---|---|---|
| `mail_search` | POST /search | Search emails in a mailbox |
| `mail_read` | GET /message/[id] | Read full email message |
| `mail_attachment` | GET /message/[id]/attachment/[partId] | Download email attachment |
| `mail_send` | POST /send | Send email (requires approval) |
| `mail_draft` | POST /draft | Create draft email |
| `mail_folders` | GET /folders | List mailbox folders |
| `mail_move` | POST /move | Move email to folder |
| `mail_flag` | POST /flag | Set/unset email flags |

## Service Layer

New service: `src/lib/server/services/mail.ts`

### Connection strategy

Connect-per-request in V1:
- ImapFlow: connect → authenticate → action → disconnect
- Nodemailer: createTransport → sendMail → close

No persistent connection pool. IMAP connections timeout after inactivity anyway, and agent usage patterns are low-frequency (not 100 req/sec). Pool can be added later as optimization.

### Service functions

```
search(config, auth, { folder, query, limit })
  → ImapFlow: connect → openBox → search → fetch headers → disconnect

getMessage(config, auth, { id, folder })
  → ImapFlow: connect → openBox → fetch full message → disconnect

getAttachment(config, auth, { id, partId, folder })
  → ImapFlow: connect → openBox → fetch MIME part → disconnect

send(config, auth, { to, cc, bcc, subject, text, html, inReplyTo })
  → Nodemailer: createTransport(smtp config) → sendMail → close

createDraft(config, auth, { to, subject, text, html })
  → Nodemailer: build MIME message
  → ImapFlow: connect → append to Drafts folder → disconnect

listFolders(config, auth)
  → ImapFlow: connect → list → disconnect

moveMessage(config, auth, { id, from, to })
  → ImapFlow: connect → openBox → move → disconnect

flagMessage(config, auth, { id, folder, add, remove })
  → ImapFlow: connect → openBox → store flags → disconnect
```

### Error handling

| Error | HTTP status | Message |
|---|---|---|
| Connection failed | 502 | "Could not connect to IMAP/SMTP server" |
| Auth failed | 401 | "IMAP/SMTP authentication failed" |
| Timeout | 504 | "IMAP operation timed out" (30s default) |
| Message not found | 404 | "Message not found" |
| Folder not found | 404 | "Folder not found" |

### Audit logging

Every mail action logged to `audit_logs` with:
- `type: "mail"`
- `action: "search" | "read" | "send" | "draft" | "folders" | "move" | "flag" | "attachment"`
- `targetSlug`
- `tokenId`

## Dashboard UI

### Target list — tabbed view

`/targets` page changes from flat list to tabbed layout using shadcn-svelte `Tabs`:

- `Tabs.Root` with `defaultValue="api"`
- Three `Tabs.Trigger`: **API (12)**, **SSH (4)**, **Email (3)** — count via `Badge` component
- `Tabs.Content` per type with filtered target list
- Existing data, no extra queries — counts from `.filter()` on loaded targets

### Email target form

On `/targets/new` and `/targets/[slug]` when type is `email`:

**Target fields:**
- Name, slug (existing)
- Email address (new, required for email type)
- IMAP: host, port, secure (SSL/TLS | STARTTLS | None)
- SMTP: host, port, secure (SSL/TLS | STARTTLS | None)

**Auth method (`imap_smtp`):**
- Username/email
- Password
- **Test connection** button — attempts IMAP login + SMTP login, shows success or error

### Permissions, audit logs

No UI changes needed — email targets appear in existing permission checkboxes and audit log viewer.

## Bootstrap Integration

Email targets appear in the existing `targets` array with the `email` field included:

```json
{
  "targets": [
    { "slug": "linear-api", "type": "api", "name": "Linear API" },
    { "slug": "deal-nl-server", "type": "ssh", "name": "Deal.nl server" },
    { "slug": "info-at-deal", "type": "email", "email": "info@deal.nl", "name": "Hoofdmailbox Deal.nl" }
  ]
}
```

No config or credentials exposed in bootstrap. Agents see slug, type, name, and email address (for email targets only).

The SessionStart hook picks up email targets automatically — no separate changes needed.

### Auth bypass

`hooks.server.ts` must add `/mail/` to the list of path prefixes that skip dashboard session auth (alongside `/api/`, `/gateway/`, `/ssh/`, `/discovery/`).

## Files to Modify

| File | Change |
|---|---|
| `src/lib/server/db/schema.ts` | Add `email` column, extend type union, add `EmailConfig` type, extend audit type |
| `src/lib/server/services/auth-methods.ts` | Add `imap_smtp` to `VALID_TYPES`, new `credentialHint` branch |
| `src/lib/server/services/audit.ts` | Extend type union with `"mail"` |
| `src/lib/server/services/mail.ts` | **New** — all IMAP/SMTP logic |
| `src/routes/mail/[target]/` | **New** — all mail route handlers |
| `src/lib/server/mcp/server.ts` | Register 8 new mail tools |
| `src/lib/server/mcp/tools/mail-*.ts` | **New** — MCP tool handlers |
| `src/routes/bootstrap/` | Include `email` field for email targets |
| `src/hooks.server.ts` | Add `/mail/` to auth bypass list |
| `src/routes/(app)/targets/` | Tabbed view, email target form, test connection |
| `package.json` | Add `imapflow`, `nodemailer`, `@types/nodemailer` |

## Out of Scope (V1)

- Connection pooling (optimize later if needed)
- Gmail OAuth2 / Microsoft Graph API backends (V2 — add as alternative auth types behind the same service interface)
- Webhooks/push notifications for new mail
- Full-text search indexing (rely on IMAP server-side search)
- Attachments on send/draft
- Provider preset buttons in dashboard (Gmail, MS365 quick-fill)
- Mailbox browser in dashboard
- Per-folder permissions
