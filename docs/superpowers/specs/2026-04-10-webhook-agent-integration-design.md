# Webhook Agent Integration

## Summary

Extend Shellgate's agent integration (SKILL.md, install scripts, dashboard UI) so OpenClaw and Hermes agents can automatically poll and process incoming webhook events. Zero-cost when idle via platform-native cron with `--light-context`.

## How It Works

1. User creates webhook endpoints in Shellgate dashboard (already implemented)
2. User configures external service (Linear, GitHub) to POST to the webhook URL
3. User runs (or re-runs) the Shellgate install command for their agent
4. Install script registers a platform-native cron job that polls every N minutes (default 5)
5. Agent polls `GET /webhooks/poll` — if empty, stops immediately ("No events")
6. If events exist, agent processes them based on its skills/instructions
7. If the agent doesn't know how to handle a webhook type, it asks the user and helps create a skill
8. Agent ACKs processed events via `POST /webhooks/ack`

## Changes

### 1. SKILL.md — Add "Incoming Webhooks" section

Add after the SSH Targets section in `src/routes/api/skill/+server.ts`:

```markdown
## Incoming Webhooks

External services (Linear, GitHub, GitLab, etc.) can send webhooks to Shellgate.
You receive them by polling — this may be set up as an automatic cron job.

### Polling for events

\`\`\`bash
curl -s -H "Authorization: Bearer $SHELLGATE_API_KEY" \
  $SHELLGATE_URL/webhooks/poll
\`\`\`

Returns all pending events across all configured webhook endpoints:

\`\`\`json
{
  "events": [
    {
      "id": "event-uuid",
      "endpointName": "Linear webhook",
      "body": { "action": "create", "type": "Issue", ... },
      "receivedAt": "2026-04-10T12:00:00Z"
    }
  ]
}
\`\`\`

If the events array is empty, stop immediately — there is nothing to process.

### Processing and acknowledging

When events exist:
1. Read each event's `endpointName` and `body` to understand what happened
2. Take appropriate action based on your skills and user instructions
3. ACK all processed events so they are not returned again:

\`\`\`bash
curl -s -X POST -H "Authorization: Bearer $SHELLGATE_API_KEY" \
  -H "Content-Type: application/json" \
  $SHELLGATE_URL/webhooks/ack \
  -d '{"eventIds": ["event-uuid-1", "event-uuid-2"]}'
\`\`\`

### Handling unknown webhook types

When you receive an event from a service you don't have instructions for:
- Do NOT silently ignore or ACK it
- Notify the user with the event details
- Ask how they want you to handle this type of webhook going forward
- Help them create a dedicated skill so future events are processed automatically

### Rules
- Always ACK events after processing — unACK'd events will be returned on every poll
- Never ACK events you haven't processed
- Events expire after 7 days if not acknowledged
- The `endpointName` tells you which service sent the webhook
```

### 2. Install Scripts — Add cron job registration

Modify `src/lib/server/utils/install-scripts.ts` to add webhook polling cron setup to both OpenClaw and Hermes scripts.

**Interactive interval prompt (both scripts):**

```bash
# Webhook polling setup
read -p "Webhook polling interval in minutes [5]: " POLL_INTERVAL
POLL_INTERVAL=${POLL_INTERVAL:-5}
```

**OpenClaw cron registration:**

```bash
# Remove existing shellgate-webhooks cron if re-running installer
openclaw cron remove shellgate-webhooks 2>/dev/null || true

openclaw cron add \
  --name "shellgate-webhooks" \
  --every "${POLL_INTERVAL}m" \
  --session isolated \
  --skill shellgate \
  --light-context \
  --message "Poll Shellgate webhooks: run curl -s -H 'Authorization: Bearer \$SHELLGATE_API_KEY' \$SHELLGATE_URL/webhooks/poll — if the events array is empty, respond ONLY 'No events'. If events exist, process each event according to your skills and instructions, then ACK all processed events." \
  2>/dev/null && echo "   Webhook polling: enabled (every ${POLL_INTERVAL}m)"
```

**Hermes cron registration:**

```bash
# Remove existing shellgate-webhooks cron if re-running installer
hermes cron remove shellgate-webhooks 2>/dev/null || true

hermes cron create "every ${POLL_INTERVAL}m" \
  "Poll Shellgate webhooks: run curl -s -H 'Authorization: Bearer \$SHELLGATE_API_KEY' \$SHELLGATE_URL/webhooks/poll — if the events array is empty, respond ONLY 'No events'. If events exist, process each event according to your skills and instructions, then ACK all processed events." \
  --skill shellgate \
  --name "shellgate-webhooks" \
  2>/dev/null && echo "   Webhook polling: enabled (every ${POLL_INTERVAL}m)"
```

**Updated success output (both):**

```
🐚 Shellgate → [Agent] connected
   URL: $SHELLGATE_URL
   Skill installed
   Webhook polling: enabled (every 5m)
```

### 3. Dashboard UI — Setup instructions

**Webhook detail page** (`src/routes/(app)/webhooks/[id]/+page.svelte`):

Add a "Setup" section below the endpoint details card:

```
Setup

1. Configure this URL in your external service (e.g. Linear, GitHub):
   [webhook URL] [Copy]

2. If you haven't already, re-run the Shellgate installer for your
   agent to enable polling.
   Go to Connect Agent → select your agent → follow the install step.

3. When your agent receives its first webhook from this service,
   it will ask you how to handle it. You can then create a dedicated
   skill for automatic processing.
```

**Webhooks list page** (`src/routes/(app)/webhooks/+page.svelte`):

No changes needed — the detail page provides the setup flow.

## Non-goals

- No Claude Code support (no built-in cron mechanism)
- No custom polling scripts or system crontab setup
- No automatic skill generation for webhook handlers
- No configurable polling interval from the dashboard (set during install only)

## Testing

No new integration tests needed — this is install script + SKILL.md text + UI copy changes. Manual verification:

1. Run updated install script for OpenClaw → verify cron job is created (`openclaw cron list`)
2. Run updated install script for Hermes → verify cron job is created (`hermes cron list`)
3. Re-run install script → verify old cron is replaced (no duplicates)
4. Verify SKILL.md contains webhook section (`GET /api/skill`)
5. Verify webhook detail page shows setup instructions
