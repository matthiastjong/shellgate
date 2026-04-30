# Shellgate MCP Server Design

## Overview

Convert Shellgate's agent-facing API into a remote MCP (Model Context Protocol) server, enabling Claude Code to interact with Shellgate via native MCP tooling instead of a custom skill + REST endpoints.

## Goals

- Expose all agent-facing functionality as MCP tools via Streamable HTTP transport
- Replace the Claude Code install script with a simple MCP server registration
- Eliminate the need for skills, env vars, and SessionStart hooks for Claude Code
- Maintain backwards compatibility for OpenClaw and Hermes (REST endpoints stay)

## Architecture

Single SvelteKit route `POST /mcp` serving as a stateless MCP server using the `@modelcontextprotocol/sdk` package.

```
Claude Code  ──(Streamable HTTP)──▶  POST /mcp
                                        │
                                   requireBearer()
                                        │
                                   MCP SDK Server
                                        │
                              ┌─────────┼─────────┐
                              ▼         ▼         ▼
                         services/  services/  services/
                         gateway    ssh        webhooks ...
```

No new services — MCP tools call existing service functions directly.

### Transport

- **Protocol:** Streamable HTTP (JSON-RPC 2.0 over HTTP POST)
- **Route:** `POST /mcp`
- **Stateless:** No MCP session tracking. Each JSON-RPC request is independently authenticated and executed.
- **No streaming tool output:** All tools are request-response.

### Auth

- Same `requireBearer()` middleware as all agent-facing routes
- Bearer token passed via `Authorization` header on the HTTP request
- `/mcp` added to the auth bypass list in `hooks.server.ts` (skips dashboard session auth)

### Initialize Response

```json
{
  "serverInfo": { "name": "shellgate", "version": "1.0.0" },
  "capabilities": { "tools": {} },
  "instructions": "Always call discover at the start of each session to learn available targets, webhooks, and skills. Then call skill_list to see available skills. Only call skill_read when you need a specific skill's full instructions."
}
```

Only `tools` capability — no resources, prompts, or sampling.

## Tools

### `discover`

List all targets, webhook endpoints, and skills accessible to this token.

- **Parameters:** none
- **Returns:** `{ targets: [...], webhooks: [...], skills: [...] }`
- **Calls:** existing discovery service logic (`GET /discovery`)

### `api_request`

Proxy an HTTP request through the gateway to an upstream API target.

- **Parameters:**
  - `target` (string, required) — target slug
  - `method` (string, required) — HTTP method (GET, POST, PUT, DELETE, PATCH)
  - `path` (string, required) — path appended to target's baseUrl
  - `headers` (object, optional) — additional headers
  - `body` (string | object, optional) — request body
  - `approved` (boolean, optional) — set to true after user approves a guarded request
- **Returns:** `{ status: number, headers: object, body: string | object }`
- **Guard flow:** If the guard triggers, returns `{ status: "approval_required", reason: string, matched: string, request: object, next_action: string }`. The tool description instructs the LLM to stop, present the reason to the user, wait for approval, then re-call with `approved: true`.

### `ssh_exec`

Execute a command on an SSH target.

- **Parameters:**
  - `target` (string, required) — target slug
  - `command` (string, required) — shell command to execute
  - `timeout` (number, optional) — timeout in seconds (default 30, max 60)
  - `approved` (boolean, optional) — set to true after user approves a guarded request
- **Returns:** `{ stdout: string, stderr: string, exitCode: number, durationMs: number }`
- **Guard flow:** Same as `api_request`.

### `webhook_poll`

Poll for pending webhook events.

- **Parameters:** none
- **Returns:** `{ events: [{ id, endpointId, endpointName, handlingInstructions, headers, body, receivedAt }] }`

### `webhook_ack`

Acknowledge processed webhook events.

- **Parameters:**
  - `eventIds` (string[], required) — event IDs to acknowledge
- **Returns:** `{ acknowledged: number }`

### `skill_list`

List all organization skills.

- **Parameters:** none
- **Returns:** `[{ slug, name, description }]`

### `skill_read`

Read the full content of a skill.

- **Parameters:**
  - `slug` (string, required) — skill slug
- **Returns:** `{ slug, name, description, content: string }`

### `skill_upsert`

Create or update a skill.

- **Parameters:**
  - `content` (string, required) — full markdown with YAML frontmatter
- **Returns:** `{ slug, version: number }`

### `skill_delete`

Delete a skill.

- **Parameters:**
  - `slug` (string, required) — skill slug
- **Returns:** `{ deleted: true }`

## Connect Agent Flow (Claude Code)

The current install script is replaced with a simpler version that registers the MCP server.

### New Install Script

```bash
#!/bin/bash
set -e

SHELLGATE_URL="__SHELLGATE_URL__"
SHELLGATE_API_KEY="__SHELLGATE_API_KEY__"

# Validate token
if [[ ! "$SHELLGATE_API_KEY" == sg_* ]]; then
  echo "Error: Invalid Shellgate API key"
  exit 1
fi

# Ensure settings file exists
SETTINGS_FILE="$HOME/.claude/settings.json"
mkdir -p "$HOME/.claude"
[ -f "$SETTINGS_FILE" ] || echo '{}' > "$SETTINGS_FILE"

# Add MCP server config
jq --arg url "$SHELLGATE_URL/mcp" \
   --arg auth "Bearer $SHELLGATE_API_KEY" \
   '.mcpServers.shellgate = {
     "type": "url",
     "url": $url,
     "headers": {
       "Authorization": $auth
     }
   }' "$SETTINGS_FILE" > "$SETTINGS_FILE.tmp" && mv "$SETTINGS_FILE.tmp" "$SETTINGS_FILE"

# Verify connection
if curl -sf -H "Authorization: Bearer $SHELLGATE_API_KEY" "$SHELLGATE_URL/verify-connection" > /dev/null 2>&1; then
  echo "Shellgate MCP configured successfully for Claude Code"
else
  echo "Warning: Could not verify connection to Shellgate"
fi
```

### What Changes

| Before | After |
|---|---|
| Sets `SHELLGATE_URL` + `SHELLGATE_API_KEY` env vars | Not needed |
| Installs SessionStart hook to refresh skill | Not needed |
| Downloads SKILL.md to `~/.claude/skills/shellgate/` | Not needed |
| Runs `claude "Confirm the shellgate skill..."` | Not needed |
| Verifies connection | Still verifies |

### What Stays

- API key creation (steps 1-3 of connect flow)
- OpenClaw/Hermes install scripts unchanged

### Cleanup

The new install script should also clean up any existing skill-based Shellgate config:
- Remove `SHELLGATE_URL` and `SHELLGATE_API_KEY` from env settings
- Remove SessionStart hook for skill refresh
- Remove `~/.claude/skills/shellgate/` directory

## Backwards Compatibility

All existing REST endpoints remain intact:
- `/gateway/[target]/[...path]` — HTTP proxy
- `/ssh/[target]/exec` — SSH execution
- `/discovery` — target listing
- `/webhooks/poll`, `/webhooks/ack` — webhook polling
- `/api/skill` — skill YAML
- `/api/skills/[slug]` — skill CRUD
- `/health`, `/verify-connection` — health checks

OpenClaw and Hermes continue using these. The MCP server is an additional interface on top of the same services.

## Implementation Notes

### File Structure

```
src/
  lib/server/mcp/
    server.ts          ← MCP server factory (creates Server instance with tools)
    tools/
      discover.ts      ← discover tool
      api-request.ts   ← api_request tool
      ssh-exec.ts      ← ssh_exec tool
      webhooks.ts      ← webhook_poll + webhook_ack tools
      skills.ts        ← skill_list + skill_read + skill_upsert + skill_delete
  routes/mcp/
    +server.ts         ← SvelteKit route handler (POST), wires auth + MCP server
```

### Dependencies

- `@modelcontextprotocol/sdk` — MCP TypeScript SDK

### Auth Integration

The SvelteKit route handler calls `requireBearer(request)` before passing the request to the MCP server. The authenticated token is threaded through to each tool handler so they can check permissions per-target.

### hooks.server.ts

Add `/mcp` to the list of paths that bypass dashboard auth:
```typescript
if (url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/gateway/') ||
    url.pathname.startsWith('/ssh/') ||
    url.pathname.startsWith('/discovery') ||
    url.pathname.startsWith('/mcp'))  // ← add this
```

## Testing

Integration tests against real Postgres (existing pattern):
- Test each MCP tool via the MCP SDK client
- Verify auth enforcement (no token → 401, wrong token → 401)
- Verify permission checking (token without target access → 403)
- Verify guard/approval flow returns correct approval_required response
- Test connect script output format
