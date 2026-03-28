# Shellgate

**Stop giving your AI agents your API keys.**

Run all agent requests through a secure, auditable gateway with scoped tokens. Shellgate sits between your AI agents and your infrastructure — every request is authenticated, authorized, and logged. The agent never sees your real credentials.

```
Agent → Shellgate → Your APIs / Servers / Tools
```

The agent never sees your real credentials.

---

> **🔒 Security note:** Run Shellgate on a separate machine from your AI agent. Agents like OpenClaw have access to the host filesystem. If Shellgate runs on the same machine, the agent could access the database directly, bypassing all access controls. A cheap VPS (Hetzner, Railway, etc.) is all you need, or use [Shellgate Cloud](https://shellgate.cloud) for a fully managed setup.

---

## Shellgate Cloud

Shellgate Cloud gives you a secure agent gateway in under a minute -- no Docker, no setup.

**[Shellgate Cloud](https://app.shellgate.cloud)** is the managed version. Sign up, get a dedicated instance, and connect your agent immediately.

- Fully managed -- no Docker, no servers
- Ready in under a minute
- Daily backups included
- 14-day free trial, no credit card needed

[**Try Shellgate Cloud for free**](https://app.shellgate.cloud)

Prefer full control? Keep reading to self-host.

---

## Quick Start

### 1. Run Shellgate

**Docker image:**

```bash
docker run -d \
  -p 3000:3000 \
  -e DATABASE_URL=postgres://user:pass@host:5432/shellgate \
  -e SESSION_SECRET=$(openssl rand -hex 32) \
  ghcr.io/matthiastjong/shellgate:latest
```

This assumes you already have a PostgreSQL database running. Point `DATABASE_URL` at your existing instance.

**Docker Compose:**

```yaml
services:
  shellgate:
    image: ghcr.io/matthiastjong/shellgate:latest
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgres://postgres:postgres@db:5432/shellgate
      SESSION_SECRET: change-me-to-a-random-string
    depends_on:
      - db

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: shellgate
      POSTGRES_PASSWORD: postgres
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

```bash
docker compose up -d
```

### 2. Set Up Your Account

Open `http://localhost:3000` → create your admin account on the setup screen.

### 3. Add a Target

A **target** is any upstream API you want agents to access (OpenAI, Anthropic, Stripe, your internal services, etc.).

Go to **Targets** → **Add Target**:
- **Name:** `openai`
- **Base URL:** `https://api.openai.com`
- **Auth:** Add your OpenAI API key as a Bearer token

### 4. Create an API Key

Go to **API Keys** → **Create Key**:
- Give it a name (e.g. `my-agent`)
- Grant it permission to the `openai` target
- Copy the `sg_...` token

### 5. Use It

Your agent now talks to Shellgate instead of OpenAI directly:

```bash
# Before: agent has your real API key
curl https://api.openai.com/v1/chat/completions \
  -H "Authorization: Bearer sk-your-real-key" \
  -d '{"model":"gpt-4o","messages":[{"role":"user","content":"Hello"}]}'

# After: agent only has a Shellgate token
curl http://localhost:3000/gateway/openai/v1/chat/completions \
  -H "Authorization: Bearer sg_your-shellgate-token" \
  -d '{"model":"gpt-4o","messages":[{"role":"user","content":"Hello"}]}'
```

Same request, same response. But now you control access, can revoke tokens instantly, and have a full audit trail.

---

## Deploy

Shellgate runs anywhere Docker runs. You can run it on your laptop for development, but for production we recommend a remote server so your agents have a stable endpoint.

| Platform | How |
|---|---|
| **Any VPS** (Hetzner, DigitalOcean, etc.) | `docker compose up -d` |
| **Railway** | Deploy from GitHub, set env vars |
| **Render** | Docker deploy, set env vars |
| **Coolify / Dokploy** | Add from Git repo, auto-detected |
| **Fly.io** | `fly launch`, attach Postgres |

**Requirements:**
- PostgreSQL 14+
- Node.js 22+ (if running without Docker)

**Environment variables:**

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `SESSION_SECRET` | ✅ | Random string for session encryption |

---

## Features

### Gateway Proxy
Route agent requests to any upstream API. Shellgate injects the real credentials so agents never see them.

### Token Management
Create, revoke, and rotate `sg_` tokens from the dashboard. Each token can be scoped to specific targets.

### Per-Token Permissions
Control exactly which APIs each agent can access. Agent A gets OpenAI, Agent B gets Anthropic. You decide.

### IP Whitelisting
Lock tokens to specific IP ranges (CIDR notation). Extra security for production agents.

### Dashboard
Web UI for managing targets, tokens, and permissions. No CLI required.

### Agent Integration
Built-in install scripts for **OpenClaw** and **Claude Code**. Connect your agent in one click from the dashboard.

### SSH Execution *(coming soon)*
Run commands on remote servers through Shellgate. Same token, same audit trail.

---

## Run from Source

```bash
git clone https://github.com/matthiastjong/shellgate.git
cd shellgate
npm install
cp .env.example .env  # edit DATABASE_URL and SESSION_SECRET
npm run dev
```

Open `http://localhost:5173`.

---

## API Reference

All management endpoints require admin authentication (session cookie from dashboard login).

Agent endpoints use Bearer token authentication (`sg_` tokens).

### Gateway

```
ANY /gateway/:target/*
```
Proxies the request to the target's base URL with injected auth. Requires a valid `sg_` Bearer token with permission for the target.

### Tokens

```
POST   /api/tokens              # Create token
GET    /api/tokens              # List tokens
DELETE /api/tokens/:id          # Revoke token
POST   /api/tokens/:id/regenerate  # Regenerate token
```

### Targets

```
POST   /api/targets             # Create target
GET    /api/targets             # List targets
PATCH  /api/targets/:id         # Update target
DELETE /api/targets/:id         # Delete target
```

### Permissions

```
POST   /api/tokens/:id/permissions          # Grant target access
DELETE /api/tokens/:id/permissions/:targetId # Revoke target access
```

### Health

```
GET /health   # Returns { status: "ok" }
```

---

## Why Shellgate?

**Without Shellgate:**
- Agents hold your real API keys
- Revoking access means rotating keys everywhere
- No visibility into what your agents are doing
- One compromised agent exposes everything

**With Shellgate:**
- Agents only hold scoped, revocable tokens
- Revoke one token without affecting others
- Every request is logged and auditable
- Credentials stay on your server, never leave

---

## License

MIT
