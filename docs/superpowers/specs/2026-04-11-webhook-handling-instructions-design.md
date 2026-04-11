# Webhook Handling Instructions

## Summary

Add a `handlingInstructions` field to webhook endpoints so agents know what to do with incoming events. Instructions are stored in Shellgate (not on the agent machine), returned in the poll response, and editable via dashboard and agent API.

## Data Model

Add one column to `webhook_endpoints`:

| Column | Type | Description |
|---|---|---|
| `handlingInstructions` | text, nullable | Plain text instruction for the agent. E.g. "Bij issue create: stuur de link. Bij comments: negeer." |

Migration: `ALTER TABLE webhook_endpoints ADD COLUMN handling_instructions TEXT;`

## Poll Response Change

Add `handlingInstructions` per event in `GET /webhooks/poll`:

```json
{
  "events": [
    {
      "id": "uuid",
      "endpointId": "uuid",
      "endpointName": "Linear webhook",
      "handlingInstructions": "Bij issue create: stuur een bericht met 'Let op matthias, nieuwe linear issue: {url}'. Bij comments: negeer en ACK direct.",
      "headers": { ... },
      "body": { ... },
      "receivedAt": "..."
    }
  ]
}
```

When `handlingInstructions` is `null`, the agent should ask the user how to handle the event.

## New Agent-Facing Endpoint

| Route | Method | Auth | Description |
|---|---|---|---|
| `POST /webhooks/endpoints/<endpointId>/instructions` | POST | Bearer token | Save handling instructions: `{ "instructions": "..." }` |

Validates that the endpoint belongs to the token's owner (via `webhook_endpoints.tokenId`). Overwrites existing instructions.

## Dashboard UI Changes

**Webhook detail page** (`/webhooks/[id]`):

Add a "Handling Instructions" section below the endpoint details card:
- Textarea showing current instructions (or empty placeholder: "No instructions configured. Your agent will ask how to handle events.")
- Save button that persists via form action
- Display below endpoint details, above the events table

**Webhook list page** (`/webhooks`):
- Add a column or indicator showing whether instructions are configured (e.g. a small icon or badge)

## SKILL.md Changes

Replace the `webhook-handlers.md` filesystem section with:

```markdown
### Processing events

Each event includes a `handlingInstructions` field with the user's instructions for this webhook endpoint.

- **If instructions exist:** Follow them exactly, then ACK the event
- **If instructions are empty (null):** Do NOT ACK. Notify the user with the event details and ask how they want this type of event handled going forward. When the user responds, save their instructions:

\`\`\`bash
curl -s -X POST -H "Authorization: Bearer $SHELLGATE_API_KEY" \
  -H "Content-Type: application/json" \
  $SHELLGATE_URL/webhooks/endpoints/<endpointId>/instructions \
  -d '{"instructions": "user response here"}'
\`\`\`

Then ACK the original event.
```

## Install Script Changes

Remove `--tools exec,read,write,curl` from the cron command — no filesystem access needed anymore. The agent only needs curl (which is default).

## Flow

### First time (no instructions):
1. Webhook arrives → stored as pending event
2. Agent polls → gets event with `handlingInstructions: null`
3. Agent notifies user: "New Linear issue: [details]. How should I handle this?"
4. User responds: "Send me a message with the link"
5. Agent POSTs instructions to Shellgate endpoint
6. Agent ACKs the event

### Every subsequent time:
1. Webhook arrives → pending
2. Agent polls → gets event with `handlingInstructions: "Send a message with the link"`
3. Agent follows instructions + ACKs
4. No user interaction needed

### Changing instructions:
- Via dashboard: edit textarea on webhook detail page
- Via agent: user says "change the Linear instruction to ..." → agent POSTs new instructions

## Files to Change

| File | Change |
|---|---|
| `src/lib/server/db/schema.ts` | Add `handlingInstructions` column |
| `drizzle/` | New migration |
| `src/lib/server/services/webhook-endpoints.ts` | Add `updateInstructions(id, instructions)` |
| `src/lib/server/services/webhook-events.ts` | Join `handlingInstructions` in `getPendingEvents` |
| `src/routes/webhooks/endpoints/[endpointId]/instructions/+server.ts` | New agent-facing endpoint |
| `src/routes/(app)/webhooks/[id]/+page.server.ts` | Add save instructions action |
| `src/routes/(app)/webhooks/[id]/+page.svelte` | Add textarea + save for instructions |
| `src/routes/(app)/webhooks/+page.svelte` | Add instructions indicator |
| `src/routes/api/skill/+server.ts` | Update SKILL.md |
| `src/lib/server/utils/install-scripts.ts` | Remove --tools flag |
| `src/hooks.server.ts` | Ensure `/webhooks/endpoints/` is auth-bypassed (already covered by `/webhooks/`) |

## Testing

### Integration tests
- `updateInstructions`: saves and retrieves instructions
- `getPendingEvents`: includes `handlingInstructions` in response
- Instructions endpoint: validates token ownership, rejects unauthorized access

### Not tested
- Route handlers, UI components

## Non-goals
- No per-event-type instruction matching
- No instruction history/versioning
- No instruction templates
