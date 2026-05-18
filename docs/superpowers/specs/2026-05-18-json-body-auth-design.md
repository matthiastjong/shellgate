# json_body Auth Method Type

## Problem

Some APIs require credentials in the request body (e.g., GoCardless Bank Account Data API sends `secret_id` and `secret_key` as JSON POST body). Current auth methods only inject into headers or query params.

## Design

New auth method type `json_body` that merges stored JSON into the request body at the gateway.

### Flow

1. Agent sends request through gateway (e.g., `POST /gateway/gocardless/api/v2/token/new/` with body `{}`)
2. Gateway detects default auth method type `json_body`
3. Gateway parses stored credential as JSON object
4. Gateway parses agent request body as JSON (falls back to `{}` if empty)
5. Gateway merges: `{ ...agentBody, ...storedCredentials }` (stored fields win)
6. Forwards to upstream with `Content-Type: application/json`

### Credential Storage

- Raw JSON string stored in `credential` field (same as other types)
- Must be a valid JSON object (validated on create/update)
- Example: `{"secret_id": "abc123", "secret_key": "xyz789"}`

### Credential Hint

Shows the top-level key names: `keys: secret_id, secret_key`

### UI

Raw JSON textarea (like `ssh_key`), with placeholder showing example format.

## Changes

| File | Change |
|------|--------|
| `src/lib/server/services/auth-methods.ts` | Add `json_body` to `VALID_TYPES`, update `computeCredentialHint` |
| `src/lib/server/services/gateway.ts` | Add body merge logic in proxy flow |
| `src/lib/components/auth-method-fields.svelte` | Add textarea for `json_body` type |
| `src/routes/(app)/targets/[slug]/+page.server.ts` | Form parsing for `json_body` |
| `tests/integration/gateway.test.ts` | Test gateway with `json_body` auth |
