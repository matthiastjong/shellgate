# Incoming Webhooks

## Summary

Add incoming webhook support to Shellgate so external services (Linear, GitHub, Stripe, etc.) can push events that agents consume via polling. Webhooks are tied to tokens (agents), not targets. Targets remain outgoing-only.

## Data Model

### `webhook_endpoints`

Configuratie per incoming webhook. Meerdere endpoints per token mogelijk (1 per externe service).

| Column | Type | Description |
|---|---|---|
| `id` | UUID, PK | |
| `tokenId` | FK -> tokens (cascade delete) | Agent that receives events |
| `slug` | text, unique | URL path: `POST /webhooks/incoming/<slug>`. Auto-generated: `wh_` + 24 random hex chars |
| `name` | text | Display name (e.g. "Linear webhook") |
| `secret` | text, nullable | HMAC secret for signature verification |
| `signatureHeader` | text, nullable | Header containing the signature (e.g. `X-Linear-Signature`) |
| `enabled` | boolean, default true | |
| `createdAt` | timestamp | |
| `updatedAt` | timestamp | |

### `webhook_events`

Received payloads, stored until delivered or expired.

| Column | Type | Description |
|---|---|---|
| `id` | UUID, PK | |
| `endpointId` | FK -> webhook_endpoints (cascade delete) | |
| `headers` | JSONB | Relevant request headers |
| `body` | JSONB | The webhook payload |
| `status` | text | `pending` / `delivered` / `expired` |
| `receivedAt` | timestamp | When received |
| `deliveredAt` | timestamp, nullable | When ACK'd by agent |
| `expiresAt` | timestamp | `receivedAt + 7 days`, for TTL cleanup |

### Indexes

- `webhook_events(endpointId, status)` — fast poll queries
- `webhook_events(expiresAt)` — cleanup queries

### Cascade deletes

- Token deleted -> endpoints cascade delete -> events cascade delete

## Routes

### Agent-facing (bearer token auth via `requireBearer`)

| Route | Method | Description |
|---|---|---|
| `GET /webhooks/poll` | GET | Fetch pending events for this token. Optional `?endpointId=...` filter |
| `POST /webhooks/ack` | POST | ACK events: `{ eventIds: string[] }`. Sets status -> `delivered` |

### Webhook receiver (public, no auth)

| Route | Method | Description |
|---|---|---|
| `POST /webhooks/incoming/[slug]` | POST | Receives payload from external service. Verifies signature if secret configured. Stores as `pending` event. Returns `200 OK` |

### Dashboard admin API (session auth)

| Route | Method | Description |
|---|---|---|
| `GET /api/webhook-endpoints` | GET | List all endpoints (with token name) |
| `POST /api/webhook-endpoints` | POST | Create endpoint: `{ tokenId, name, secret?, signatureHeader? }` |
| `GET /api/webhook-endpoints/[id]` | GET | Detail + recent events |
| `DELETE /api/webhook-endpoints/[id]` | DELETE | Delete endpoint + cascade events |
| `GET /api/webhook-events` | GET | Events list, filterable by `endpointId`, `status` |

## Services

### `webhook-endpoints` service

- `createEndpoint(tokenId, name, secret?, signatureHeader?)` — generates `wh_` + random slug
- `listEndpoints(tokenId?)` — list, optionally filtered by token
- `getEndpoint(id)` — detail
- `deleteEndpoint(id)` — cascade delete events
- `getEndpointBySlug(slug)` — for incoming route lookup

### `webhook-events` service

- `createEvent(endpointId, headers, body)` — stores payload with status `pending`, sets `expiresAt` to +7 days
- `getPendingEvents(tokenId, endpointId?)` — all pending events for a token, optionally filtered
- `acknowledgeEvents(tokenId, eventIds)` — sets status -> `delivered`, `deliveredAt` -> now. Validates events belong to this token
- `cleanupExpiredEvents()` — delete events where `expiresAt < now`

### Signature verification (in incoming route)

1. Read raw body as buffer
2. If endpoint has a `secret` -> compute `HMAC-SHA256(secret, rawBody)`
3. Compare with value from configured `signatureHeader`
4. Mismatch -> `401`, no event stored
5. No secret configured -> accept directly

### Cleanup

Utility callable from admin endpoint `POST /api/webhook-events/cleanup`. No scheduler in v1.

## Poll & ACK Flow

```
External Service                Shellgate                          Agent
     |                              |                                |
     |--- POST /webhooks/incoming/wh_abc123 -->|                     |
     |                              |  verify signature              |
     |                              |  store event (pending)         |
     |                              |<-- 200 OK ---|                 |
     |                              |                                |
     |                              |<-- GET /webhooks/poll ---------|
     |                              |  (bearer token auth)           |
     |                              |--- events[] ------------------>|
     |                              |                                |
     |                              |                   process events
     |                              |                                |
     |                              |<-- POST /webhooks/ack ---------|
     |                              |  { eventIds: [...] }           |
     |                              |  mark delivered                |
     |                              |--- 200 OK ------------------->|
```

## Poll Response Format

```json
{
  "events": [
    {
      "id": "uuid",
      "endpointId": "uuid",
      "endpointName": "Linear webhook",
      "headers": { "content-type": "application/json", "x-linear-signature": "..." },
      "body": { "action": "create", "data": { "..." } },
      "receivedAt": "2026-04-10T12:00:00Z"
    }
  ]
}
```

## Dashboard UI

### `/webhooks` page

- Table of all webhook endpoints: name, token name, slug (copyable full URL), pending event count, enabled badge
- "New endpoint" button -> form: token select (dropdown), name, secret (optional), signature header (optional)
- Delete action per endpoint

### `/webhooks/[id]` page

- Endpoint detail: name, full URL (copyable), secret (masked), signature header, linked token
- Table of recent events: status badge (pending/delivered/expired), received time, delivered time, payload preview (~100 chars)
- Expandable/modal event detail with full headers + body (JSON formatted)

### Integration in existing pages

- `/api-keys/[id]` (token detail): section showing linked webhook endpoints
- Navigation: "Webhooks" item in sidebar

### Design principles

- Clean, intuitive, minimal — consistent with existing Shellgate UI
- Reuse existing components: `data-table`, `badge`, `dialog`, `use:enhance` forms with local state updates

## Testing

### Integration tests (real Postgres via Testcontainers)

- Webhook endpoint CRUD + cascade delete on token deletion
- Event creation on incoming webhook
- Signature verification (valid, invalid, no secret)
- Poll: returns only pending events for the correct token
- ACK: marks as delivered, validates ownership
- Cleanup: deletes expired events

### Unit tests

- HMAC signature verification function
- Slug generation format

### Not tested

- Route handlers (thin wrappers)
- UI components

## Non-goals (v1)

- No realtime/websocket push — poll only
- No retry/redelivery from Shellgate
- No webhook event filtering (all payloads stored)
- No rate limiting on incoming endpoint
- No edit of existing endpoints (delete + recreate)
