# Shellgate MCP Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose Shellgate's agent-facing API as a remote MCP server so Claude Code can use it natively via Streamable HTTP transport.

**Architecture:** Single SvelteKit route (`POST /mcp`) using `@modelcontextprotocol/sdk`. Stateless — each request is authenticated via bearer token. MCP tools call existing service functions directly, no new services needed.

**Tech Stack:** `@modelcontextprotocol/sdk`, SvelteKit, existing Shellgate services

**Spec:** `docs/superpowers/specs/2026-04-30-mcp-server-design.md`

---

## File Structure

```
src/lib/server/mcp/
  server.ts              ← MCP server factory, tool registration, instructions
  tools/discover.ts      ← discover tool
  tools/api-request.ts   ← api_request tool (gateway proxy)
  tools/ssh-exec.ts      ← ssh_exec tool
  tools/webhooks.ts      ← webhook_poll + webhook_ack tools
  tools/skills.ts        ← skill_list + skill_read + skill_upsert + skill_delete
src/routes/mcp/
  +server.ts             ← SvelteKit POST handler, auth + MCP transport
src/hooks.server.ts      ← Add /mcp to auth bypass list
src/lib/server/utils/
  install-scripts.ts     ← Replace Claude Code install script
tests/integration/
  mcp.test.ts            ← Integration tests for MCP tools
```

---

### Task 1: Install MCP SDK dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install the MCP SDK**

```bash
npm install @modelcontextprotocol/sdk
```

- [ ] **Step 2: Verify installation**

```bash
npm ls @modelcontextprotocol/sdk
```

Expected: shows the installed version

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add @modelcontextprotocol/sdk dependency"
```

---

### Task 2: Create the discover tool

**Files:**
- Create: `src/lib/server/mcp/tools/discover.ts`
- Test: `tests/integration/mcp.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/integration/mcp.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { truncateAll, createTestToken, createTestTarget, grantPermission, createTestAuthMethod, createTestWebhookEndpoint } from "../helpers";
import { createMcpToolHandler } from "$lib/server/mcp/server";

describe("MCP tools", () => {
	beforeEach(async () => {
		await truncateAll();
	});

	describe("discover", () => {
		it("returns targets, webhooks, and skills accessible to the token", async () => {
			const { token, plainToken } = await createTestToken();
			const target = await createTestTarget("OpenAI", "https://api.openai.com");
			await createTestAuthMethod(target.id);
			await grantPermission(token.id, target.id);
			await createTestWebhookEndpoint(token.id, { name: "Linear" });

			const handler = createMcpToolHandler(token);
			const result = await handler("discover", {});

			expect(result).toHaveProperty("targets");
			expect(result).toHaveProperty("webhooks");
			expect(result).toHaveProperty("skills");
			expect(result.targets).toHaveLength(1);
			expect(result.targets[0].slug).toBe(target.slug);
			expect(result.webhooks).toHaveLength(1);
		});
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/integration/mcp.test.ts --reporter=verbose
```

Expected: FAIL — module `$lib/server/mcp/server` not found

- [ ] **Step 3: Create the discover tool**

Create `src/lib/server/mcp/tools/discover.ts`:

```typescript
import { listPermissions } from "$lib/server/services/permissions";
import { getTargetById } from "$lib/server/services/targets";
import { listEndpoints } from "$lib/server/services/webhook-endpoints";
import { listSkills } from "$lib/server/services/skills";
import type { Token } from "$lib/server/db/schema";

export async function discover(token: Token) {
	const permissions = await listPermissions(token.id);

	const targets = (
		await Promise.all(
			permissions.map(async (p) => {
				const target = await getTargetById(p.targetId);
				if (!target || !target.enabled) return null;
				return {
					slug: target.slug,
					name: target.name,
					type: target.type,
					...(target.type === "api" && {
						proxy: `/gateway/${target.slug}`,
						baseUrl: target.baseUrl,
					}),
				};
			})
		)
	).filter(Boolean);

	const webhookEndpoints = await listEndpoints(token.id);
	const webhooks = webhookEndpoints
		.filter((ep) => ep.enabled)
		.map((ep) => ({
			name: ep.name,
			poll: "/webhooks/poll",
			ack: "/webhooks/ack",
		}));

	const skills = await listSkills();

	return { targets, webhooks, skills };
}
```

- [ ] **Step 4: Create the MCP server factory (minimal, just discover)**

Create `src/lib/server/mcp/server.ts`:

```typescript
import type { Token } from "$lib/server/db/schema";
import { discover } from "./tools/discover";

type ToolHandler = (name: string, args: Record<string, unknown>) => Promise<unknown>;

export function createMcpToolHandler(token: Token): ToolHandler {
	return async (name: string, args: Record<string, unknown>) => {
		switch (name) {
			case "discover":
				return discover(token);
			default:
				throw new Error(`Unknown tool: ${name}`);
		}
	};
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npx vitest run tests/integration/mcp.test.ts --reporter=verbose
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/mcp/tools/discover.ts src/lib/server/mcp/server.ts tests/integration/mcp.test.ts
git commit -m "feat: add MCP discover tool"
```

---

### Task 3: Create the api_request tool

**Files:**
- Create: `src/lib/server/mcp/tools/api-request.ts`
- Modify: `src/lib/server/mcp/server.ts`
- Modify: `tests/integration/mcp.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/integration/mcp.test.ts`:

```typescript
import { vi } from "vitest";

describe("api_request", () => {
	it("proxies a GET request to the upstream target", async () => {
		const { token } = await createTestToken();
		const target = await createTestTarget("TestAPI", "https://api.test.com");
		await createTestAuthMethod(target.id, { credential: "sk-test-key" });
		await grantPermission(token.id, target.id);

		const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
			Response.json({ data: "hello" })
		);

		const handler = createMcpToolHandler(token);
		const result = await handler("api_request", {
			target: target.slug,
			method: "GET",
			path: "/v1/test",
		});

		expect(result).toHaveProperty("status", 200);
		expect(result).toHaveProperty("body");
		expect(fetchSpy).toHaveBeenCalledOnce();

		const calledUrl = fetchSpy.mock.calls[0][0];
		expect(calledUrl).toContain("https://api.test.com/v1/test");

		fetchSpy.mockRestore();
	});

	it("returns approval_required when guard triggers", async () => {
		const { token } = await createTestToken();
		const target = await createTestTarget("TestAPI", "https://api.test.com");
		await createTestAuthMethod(target.id, { credential: "sk-test-key" });
		await grantPermission(token.id, target.id);

		const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
			Response.json({})
		);

		const handler = createMcpToolHandler(token);
		const result = await handler("api_request", {
			target: target.slug,
			method: "DELETE",
			path: "/v1/users/123",
		});

		expect(result).toHaveProperty("status", "approval_required");
		expect(result).toHaveProperty("reason");
		expect(result).toHaveProperty("next_action");

		fetchSpy.mockRestore();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/integration/mcp.test.ts --reporter=verbose
```

Expected: FAIL — `Unknown tool: api_request`

- [ ] **Step 3: Create the api_request tool**

Create `src/lib/server/mcp/tools/api-request.ts`:

```typescript
import type { Token } from "$lib/server/db/schema";
import { resolveGatewayTarget, proxyToTarget } from "$lib/server/services/gateway";
import { normalizeApiRequest, evaluateRules } from "$lib/server/guard";
import { logRequest } from "$lib/server/services/audit";

interface ApiRequestArgs {
	target: string;
	method: string;
	path: string;
	headers?: Record<string, string>;
	body?: unknown;
	approved?: boolean;
}

export async function apiRequest(token: Token, args: ApiRequestArgs) {
	const { target: targetSlug, method, path, headers = {}, body, approved } = args;

	const resolved = await resolveGatewayTarget(token, targetSlug);
	if ("error" in resolved) {
		const errorResponse = resolved.error;
		return { status: errorResponse.status, body: await errorResponse.text() };
	}

	const { target } = resolved;

	// Guard check
	if (!approved) {
		const normalized = normalizeApiRequest(method, path);
		const guardResult = evaluateRules(normalized);
		if (guardResult.action === "block") {
			return {
				status: "blocked",
				reason: guardResult.reason,
				matched: guardResult.matched,
			};
		}
		if (guardResult.action === "approval_required") {
			return {
				status: "approval_required",
				reason: guardResult.reason,
				matched: guardResult.matched,
				request: { type: "api", method, path },
				next_action:
					"STOP. Do NOT re-send this request yet. Present the reason to the user, wait for their explicit approval, then re-call this tool with approved: true.",
			};
		}
	}

	// Build a Request object for proxyToTarget
	const upstreamHeaders = new Headers(headers);
	const requestInit: RequestInit = {
		method,
		headers: upstreamHeaders,
	};
	if (body !== undefined && method !== "GET" && method !== "HEAD") {
		requestInit.body = typeof body === "string" ? body : JSON.stringify(body);
		if (typeof body !== "string" && !upstreamHeaders.has("Content-Type")) {
			upstreamHeaders.set("Content-Type", "application/json");
		}
	}

	const proxyRequest = new Request(`http://placeholder/${path}`, requestInit);
	const startTime = Date.now();
	const response = await proxyToTarget(target, path, proxyRequest);
	const durationMs = Date.now() - startTime;

	// Log audit
	await logRequest({
		tokenId: token.id,
		tokenName: token.name,
		targetId: target.id,
		targetSlug: target.slug,
		type: "gateway",
		method,
		path,
		statusCode: response.status,
		clientIp: "mcp",
		durationMs,
		guardAction: approved ? "approved" : "allow",
	});

	// Parse response
	const responseBody = await response.text();
	let parsedBody: unknown;
	try {
		parsedBody = JSON.parse(responseBody);
	} catch {
		parsedBody = responseBody;
	}

	const responseHeaders: Record<string, string> = {};
	response.headers.forEach((value, key) => {
		responseHeaders[key] = value;
	});

	return {
		status: response.status,
		headers: responseHeaders,
		body: parsedBody,
	};
}
```

- [ ] **Step 4: Register in server.ts**

Add to `src/lib/server/mcp/server.ts`:

```typescript
import { apiRequest } from "./tools/api-request";

// In the switch:
case "api_request":
	return apiRequest(token, args as any);
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run tests/integration/mcp.test.ts --reporter=verbose
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/mcp/tools/api-request.ts src/lib/server/mcp/server.ts tests/integration/mcp.test.ts
git commit -m "feat: add MCP api_request tool with guard flow"
```

---

### Task 4: Create the ssh_exec tool

**Files:**
- Create: `src/lib/server/mcp/tools/ssh-exec.ts`
- Modify: `src/lib/server/mcp/server.ts`
- Modify: `tests/integration/mcp.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/integration/mcp.test.ts`:

```typescript
describe("ssh_exec", () => {
	it("returns approval_required for dangerous commands", async () => {
		const { token } = await createTestToken();
		const target = await createTestTarget("Server", undefined);
		// Manually set target to SSH type with config
		const { db } = await import("$lib/server/db");
		const { targets } = await import("$lib/server/db/schema");
		const { eq } = await import("drizzle-orm");
		await db
			.update(targets)
			.set({
				type: "ssh",
				config: { host: "10.0.0.1", port: 22, username: "deploy" },
			})
			.where(eq(targets.id, target.id));
		await createTestAuthMethod(target.id, {
			type: "ssh_key",
			credential: "fake-ssh-key",
		});
		await grantPermission(token.id, target.id);

		const handler = createMcpToolHandler(token);
		const result = await handler("ssh_exec", {
			target: target.slug,
			command: "rm -rf /tmp/old",
		});

		expect(result).toHaveProperty("status", "approval_required");
		expect(result).toHaveProperty("reason");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/integration/mcp.test.ts --reporter=verbose
```

Expected: FAIL — `Unknown tool: ssh_exec`

- [ ] **Step 3: Create the ssh_exec tool**

Create `src/lib/server/mcp/tools/ssh-exec.ts`:

```typescript
import type { Token, SshConfig } from "$lib/server/db/schema";
import { getTargetBySlug } from "$lib/server/services/targets";
import { checkPermission } from "$lib/server/services/permissions";
import { getDefaultAuthMethod } from "$lib/server/services/auth-methods";
import { executeCommand } from "$lib/server/services/ssh";
import { normalizeSshRequest, evaluateRules } from "$lib/server/guard";
import { logRequest } from "$lib/server/services/audit";

interface SshExecArgs {
	target: string;
	command: string;
	timeout?: number;
	approved?: boolean;
}

export async function sshExec(token: Token, args: SshExecArgs) {
	const { target: targetSlug, command, timeout, approved } = args;

	if (!command || typeof command !== "string" || !command.trim()) {
		return { error: "command is required" };
	}

	const target = await getTargetBySlug(targetSlug);
	if (!target || !target.enabled) {
		return { error: `Target "${targetSlug}" not found or disabled` };
	}

	if (target.type !== "ssh") {
		return { error: `Target "${targetSlug}" is not an SSH target` };
	}

	const hasPermission = await checkPermission(token.id, target.id);
	if (!hasPermission) {
		return { error: `No permission to access target "${targetSlug}"` };
	}

	const config = target.config as SshConfig;
	if (!config?.host || !config?.username) {
		return { error: "Target SSH configuration is incomplete" };
	}

	const authMethod = await getDefaultAuthMethod(target.id);
	if (!authMethod || authMethod.type !== "ssh_key") {
		return { error: "No SSH key configured for this target" };
	}

	// Guard check
	if (!approved) {
		const normalized = normalizeSshRequest(command);
		const guardResult = evaluateRules(normalized);
		if (guardResult.action === "block") {
			return {
				status: "blocked",
				reason: guardResult.reason,
				matched: guardResult.matched,
			};
		}
		if (guardResult.action === "approval_required") {
			return {
				status: "approval_required",
				reason: guardResult.reason,
				matched: guardResult.matched,
				request: { type: "ssh", command },
				next_action:
					"STOP. Do NOT re-send this command yet. Present the reason to the user, wait for their explicit approval, then re-call this tool with approved: true.",
			};
		}
	}

	const timeoutMs = typeof timeout === "number" ? Math.min(timeout, 60) * 1000 : 30000;
	const startTime = Date.now();

	try {
		const result = await executeCommand(config, authMethod.credential, command, timeoutMs);
		const durationMs = Date.now() - startTime;

		await logRequest({
			tokenId: token.id,
			tokenName: token.name,
			targetId: target.id,
			targetSlug: target.slug,
			type: "ssh",
			path: command,
			statusCode: result.exitCode === 0 ? 200 : 500,
			clientIp: "mcp",
			durationMs,
			guardAction: approved ? "approved" : "allow",
		});

		return {
			exitCode: result.exitCode,
			stdout: result.stdout,
			stderr: result.stderr,
			durationMs,
		};
	} catch (err) {
		return { error: err instanceof Error ? err.message : "SSH execution failed" };
	}
}
```

- [ ] **Step 4: Register in server.ts**

Add to `src/lib/server/mcp/server.ts`:

```typescript
import { sshExec } from "./tools/ssh-exec";

// In the switch:
case "ssh_exec":
	return sshExec(token, args as any);
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run tests/integration/mcp.test.ts --reporter=verbose
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/mcp/tools/ssh-exec.ts src/lib/server/mcp/server.ts tests/integration/mcp.test.ts
git commit -m "feat: add MCP ssh_exec tool with guard flow"
```

---

### Task 5: Create the webhook tools

**Files:**
- Create: `src/lib/server/mcp/tools/webhooks.ts`
- Modify: `src/lib/server/mcp/server.ts`
- Modify: `tests/integration/mcp.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `tests/integration/mcp.test.ts`:

```typescript
import { createWebhookEvent } from "$lib/server/services/webhook-events";

describe("webhook_poll", () => {
	it("returns pending events for the token", async () => {
		const { token } = await createTestToken();
		const endpoint = await createTestWebhookEndpoint(token.id, { name: "Test Hook" });

		// Create a pending event
		await createWebhookEvent(endpoint.id, { "x-test": "1" }, { action: "created" });

		const handler = createMcpToolHandler(token);
		const result = await handler("webhook_poll", {});

		expect(result).toHaveProperty("events");
		expect(result.events.length).toBeGreaterThanOrEqual(1);
		expect(result.events[0]).toHaveProperty("endpointName", "Test Hook");
	});
});

describe("webhook_ack", () => {
	it("acknowledges events by ID", async () => {
		const { token } = await createTestToken();
		const endpoint = await createTestWebhookEndpoint(token.id, { name: "Test Hook" });
		await createWebhookEvent(endpoint.id, {}, { action: "test" });

		const handler = createMcpToolHandler(token);
		const pollResult = await handler("webhook_poll", {});
		const eventIds = pollResult.events.map((e: any) => e.id);

		const ackResult = await handler("webhook_ack", { eventIds });
		expect(ackResult).toHaveProperty("acknowledged");
		expect(ackResult.acknowledged).toBe(eventIds.length);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/integration/mcp.test.ts --reporter=verbose
```

Expected: FAIL — `Unknown tool: webhook_poll`

- [ ] **Step 3: Create the webhook tools**

Create `src/lib/server/mcp/tools/webhooks.ts`:

```typescript
import type { Token } from "$lib/server/db/schema";
import { getPendingEvents, acknowledgeEvents } from "$lib/server/services/webhook-events";

export async function webhookPoll(token: Token) {
	const events = await getPendingEvents(token.id);
	return { events };
}

interface WebhookAckArgs {
	eventIds: string[];
}

export async function webhookAck(token: Token, args: WebhookAckArgs) {
	const { eventIds } = args;

	if (!Array.isArray(eventIds) || eventIds.length === 0) {
		return { error: "eventIds is required and must be a non-empty array of strings" };
	}

	if (!eventIds.every((id) => typeof id === "string")) {
		return { error: "eventIds must be an array of strings" };
	}

	const count = await acknowledgeEvents(token.id, eventIds);
	return { acknowledged: count };
}
```

- [ ] **Step 4: Register in server.ts**

Add to `src/lib/server/mcp/server.ts`:

```typescript
import { webhookPoll, webhookAck } from "./tools/webhooks";

// In the switch:
case "webhook_poll":
	return webhookPoll(token);
case "webhook_ack":
	return webhookAck(token, args as any);
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run tests/integration/mcp.test.ts --reporter=verbose
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/mcp/tools/webhooks.ts src/lib/server/mcp/server.ts tests/integration/mcp.test.ts
git commit -m "feat: add MCP webhook_poll and webhook_ack tools"
```

---

### Task 6: Create the skill tools

**Files:**
- Create: `src/lib/server/mcp/tools/skills.ts`
- Modify: `src/lib/server/mcp/server.ts`
- Modify: `tests/integration/mcp.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `tests/integration/mcp.test.ts`:

```typescript
describe("skill_list", () => {
	it("returns all skills with slug and description", async () => {
		const { token } = await createTestToken();
		const { createSkill } = await import("$lib/server/services/skills");
		await createSkill("---\nname: test-skill\ndescription: A test skill\n---\nContent here");

		const handler = createMcpToolHandler(token);
		const result = await handler("skill_list", {});

		expect(result).toHaveLength(1);
		expect(result[0]).toHaveProperty("slug", "test-skill");
		expect(result[0]).toHaveProperty("description", "A test skill");
	});
});

describe("skill_read", () => {
	it("returns full skill content", async () => {
		const { token } = await createTestToken();
		const { createSkill } = await import("$lib/server/services/skills");
		await createSkill("---\nname: test-skill\ndescription: A test skill\n---\nFull content here");

		const handler = createMcpToolHandler(token);
		const result = await handler("skill_read", { slug: "test-skill" });

		expect(result).toHaveProperty("slug", "test-skill");
		expect(result).toHaveProperty("content");
		expect(result.content).toContain("Full content here");
	});

	it("returns error for non-existent skill", async () => {
		const { token } = await createTestToken();
		const handler = createMcpToolHandler(token);
		const result = await handler("skill_read", { slug: "nonexistent" });

		expect(result).toHaveProperty("error");
	});
});

describe("skill_upsert", () => {
	it("creates a new skill", async () => {
		const { token } = await createTestToken();
		const handler = createMcpToolHandler(token);
		const result = await handler("skill_upsert", {
			content: "---\nname: new-skill\ndescription: Brand new\n---\nSkill body",
		});

		expect(result).toHaveProperty("slug", "new-skill");
		expect(result).toHaveProperty("version");
	});

	it("updates an existing skill", async () => {
		const { token } = await createTestToken();
		const { createSkill } = await import("$lib/server/services/skills");
		await createSkill("---\nname: my-skill\ndescription: Original\n---\nOld content");

		const handler = createMcpToolHandler(token);
		const result = await handler("skill_upsert", {
			content: "---\nname: my-skill\ndescription: Updated\n---\nNew content",
		});

		expect(result).toHaveProperty("slug", "my-skill");
		expect(result.version).toBeGreaterThanOrEqual(2);
	});
});

describe("skill_delete", () => {
	it("deletes an existing skill", async () => {
		const { token } = await createTestToken();
		const { createSkill } = await import("$lib/server/services/skills");
		await createSkill("---\nname: doomed\ndescription: Will be deleted\n---\nBye");

		const handler = createMcpToolHandler(token);
		const result = await handler("skill_delete", { slug: "doomed" });

		expect(result).toEqual({ deleted: true });
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/integration/mcp.test.ts --reporter=verbose
```

Expected: FAIL — `Unknown tool: skill_list`

- [ ] **Step 3: Create the skill tools**

Create `src/lib/server/mcp/tools/skills.ts`:

```typescript
import { listSkills, getSkill, createSkill, updateSkill, deleteSkill } from "$lib/server/services/skills";
import { parseSkillMd } from "$lib/server/utils/skill-parser";

export async function skillList() {
	return listSkills();
}

export async function skillRead(args: { slug: string }) {
	const skill = await getSkill(args.slug);
	if (!skill) {
		return { error: `Skill "${args.slug}" not found` };
	}
	return {
		slug: skill.slug,
		description: skill.description,
		content: skill.contentMd,
		version: skill.version,
	};
}

export async function skillUpsert(args: { content: string }) {
	if (!args.content || typeof args.content !== "string") {
		return { error: "content is required" };
	}

	let parsed: { slug: string; description: string };
	try {
		parsed = parseSkillMd(args.content);
	} catch (err) {
		return { error: err instanceof Error ? err.message : "Invalid skill content" };
	}

	// Check if exists → update, otherwise create
	const existing = await getSkill(parsed.slug);
	if (existing) {
		const updated = await updateSkill(parsed.slug, args.content);
		return { slug: updated!.slug, version: updated!.version };
	}

	const created = await createSkill(args.content);
	return { slug: created.slug, version: created.version };
}

export async function skillDelete(args: { slug: string }) {
	const deleted = await deleteSkill(args.slug);
	if (!deleted) {
		return { error: `Skill "${args.slug}" not found` };
	}
	return { deleted: true };
}
```

- [ ] **Step 4: Register in server.ts**

Add to `src/lib/server/mcp/server.ts`:

```typescript
import { skillList, skillRead, skillUpsert, skillDelete } from "./tools/skills";

// In the switch:
case "skill_list":
	return skillList();
case "skill_read":
	return skillRead(args as any);
case "skill_upsert":
	return skillUpsert(args as any);
case "skill_delete":
	return skillDelete(args as any);
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run tests/integration/mcp.test.ts --reporter=verbose
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/mcp/tools/skills.ts src/lib/server/mcp/server.ts tests/integration/mcp.test.ts
git commit -m "feat: add MCP skill_list, skill_read, skill_upsert, skill_delete tools"
```

---

### Task 7: Build the full MCP server with SDK integration

**Files:**
- Modify: `src/lib/server/mcp/server.ts` (rewrite to use MCP SDK)

- [ ] **Step 1: Rewrite server.ts to use the MCP SDK**

Replace `src/lib/server/mcp/server.ts` with the full MCP server using `@modelcontextprotocol/sdk`:

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Token } from "$lib/server/db/schema";
import { discover } from "./tools/discover";
import { apiRequest } from "./tools/api-request";
import { sshExec } from "./tools/ssh-exec";
import { webhookPoll, webhookAck } from "./tools/webhooks";
import { skillList, skillRead, skillUpsert, skillDelete } from "./tools/skills";

const INSTRUCTIONS = `Always call discover at the start of each session to learn available targets, webhooks, and skills. Then call skill_list to see available skills. Only call skill_read when you need a specific skill's full instructions.`;

export function createMcpServer() {
	const server = new McpServer({
		name: "shellgate",
		version: "1.0.0",
		instructions: INSTRUCTIONS,
	});

	return server;
}

export function registerTools(server: McpServer, token: Token) {
	server.tool("discover", "List all targets, webhook endpoints, and skills accessible to this token", {}, async () => {
		const result = await discover(token);
		return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
	});

	server.tool(
		"api_request",
		"Proxy an HTTP request through the gateway to an upstream API target. If the response has status 'approval_required', present the reason to the user and re-call with approved: true after they confirm.",
		{
			target: z.string().describe("Target slug"),
			method: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"]).describe("HTTP method"),
			path: z.string().describe("Path appended to target's baseUrl"),
			headers: z.record(z.string()).optional().describe("Additional request headers"),
			body: z.union([z.string(), z.record(z.unknown())]).optional().describe("Request body (string or JSON object)"),
			approved: z.boolean().optional().describe("Set to true after user approves a guarded request"),
		},
		async (args) => {
			const result = await apiRequest(token, args);
			return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
		}
	);

	server.tool(
		"ssh_exec",
		"Execute a command on an SSH target. If the response has status 'approval_required', present the reason to the user and re-call with approved: true after they confirm.",
		{
			target: z.string().describe("Target slug"),
			command: z.string().describe("Shell command to execute"),
			timeout: z.number().optional().describe("Timeout in seconds (default 30, max 60)"),
			approved: z.boolean().optional().describe("Set to true after user approves a guarded request"),
		},
		async (args) => {
			const result = await sshExec(token, args);
			return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
		}
	);

	server.tool("webhook_poll", "Poll for pending webhook events", {}, async () => {
		const result = await webhookPoll(token);
		return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
	});

	server.tool(
		"webhook_ack",
		"Acknowledge processed webhook events",
		{
			eventIds: z.array(z.string()).describe("Event IDs to acknowledge"),
		},
		async (args) => {
			const result = await webhookAck(token, args);
			return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
		}
	);

	server.tool("skill_list", "List all organization skills with slug and description", {}, async () => {
		const result = await skillList();
		return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
	});

	server.tool(
		"skill_read",
		"Read the full content of a skill",
		{
			slug: z.string().describe("Skill slug"),
		},
		async (args) => {
			const result = await skillRead(args);
			return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
		}
	);

	server.tool(
		"skill_upsert",
		"Create or update a skill. Content must be full markdown with YAML frontmatter (name, description)",
		{
			content: z.string().describe("Full skill markdown with YAML frontmatter"),
		},
		async (args) => {
			const result = await skillUpsert(args);
			return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
		}
	);

	server.tool(
		"skill_delete",
		"Delete a skill",
		{
			slug: z.string().describe("Skill slug"),
		},
		async (args) => {
			const result = await skillDelete(args);
			return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
		}
	);
}

// Keep the simple handler for tests
export function createMcpToolHandler(token: Token) {
	return async (name: string, args: Record<string, unknown>): Promise<any> => {
		switch (name) {
			case "discover":
				return discover(token);
			case "api_request":
				return apiRequest(token, args as any);
			case "ssh_exec":
				return sshExec(token, args as any);
			case "webhook_poll":
				return webhookPoll(token);
			case "webhook_ack":
				return webhookAck(token, args as any);
			case "skill_list":
				return skillList();
			case "skill_read":
				return skillRead(args as any);
			case "skill_upsert":
				return skillUpsert(args as any);
			case "skill_delete":
				return skillDelete(args as any);
			default:
				throw new Error(`Unknown tool: ${name}`);
		}
	};
}
```

- [ ] **Step 2: Run all tests to verify nothing broke**

```bash
npx vitest run tests/integration/mcp.test.ts --reporter=verbose
```

Expected: All PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/server/mcp/server.ts
git commit -m "feat: integrate MCP SDK with tool registration and instructions"
```

---

### Task 8: Create the SvelteKit route handler

**Files:**
- Create: `src/routes/mcp/+server.ts`
- Modify: `src/hooks.server.ts`

- [ ] **Step 1: Create the route handler**

Create `src/routes/mcp/+server.ts`:

```typescript
import type { RequestHandler } from "./$types";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { requireBearer } from "$lib/server/api-auth";
import { createMcpServer, registerTools } from "$lib/server/mcp/server";

export const POST: RequestHandler = async ({ request }) => {
	const token = await requireBearer(request);

	const server = createMcpServer();
	registerTools(server, token);

	const transport = new StreamableHTTPServerTransport({
		sessionIdGenerator: undefined, // stateless
	});

	await server.connect(transport);

	const response = await transport.handleRequest(request);
	return response;
};

export const GET: RequestHandler = async () => {
	return new Response("Shellgate MCP server. Use POST with MCP protocol.", {
		status: 405,
		headers: { Allow: "POST" },
	});
};

export const DELETE: RequestHandler = async () => {
	return new Response(null, { status: 405, headers: { Allow: "POST" } });
};
```

- [ ] **Step 2: Add /mcp to auth bypass in hooks.server.ts**

In `src/hooks.server.ts`, add `pathname.startsWith("/mcp")` to the bypass list:

```typescript
if (
	pathname.startsWith("/api/") ||
	pathname.startsWith("/gateway/") ||
	pathname.startsWith("/ssh/") ||
	pathname.startsWith("/discovery") ||
	pathname.startsWith("/webhooks/") ||
	pathname.startsWith("/verify-connection") ||
	pathname.startsWith("/health") ||
	pathname.startsWith("/mcp") ||        // ← add this
	pathname.startsWith("/_app/") ||
	pathname === "/favicon.ico"
) {
```

- [ ] **Step 3: Verify the dev server starts**

```bash
npm run dev -- --port 5174 &
sleep 3
curl -s -X POST http://localhost:5174/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer invalid" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"0.1"}},"id":1}'
kill %1
```

Expected: 401 Unauthorized (auth check works)

- [ ] **Step 4: Commit**

```bash
git add src/routes/mcp/+server.ts src/hooks.server.ts
git commit -m "feat: add /mcp route with Streamable HTTP transport and auth"
```

---

### Task 9: Update the Claude Code install script

**Files:**
- Modify: `src/lib/server/utils/install-scripts.ts`

- [ ] **Step 1: Read the current install script**

Read `src/lib/server/utils/install-scripts.ts` to understand the exact current `generateClaudeCodeScript` function.

- [ ] **Step 2: Replace the Claude Code script generator**

Update `generateClaudeCodeScript` in `src/lib/server/utils/install-scripts.ts` to generate a script that registers the MCP server instead of installing skills and hooks:

```typescript
export function generateClaudeCodeScript(baseUrl: string, apiKey: string): string {
	return `#!/bin/bash
set -e

SHELLGATE_URL="${baseUrl}"
SHELLGATE_API_KEY="${apiKey}"

# Validate token
if [[ ! "$SHELLGATE_API_KEY" == sg_* ]]; then
  echo "Error: Invalid Shellgate API key"
  exit 1
fi

# Ensure Claude settings file exists
SETTINGS_FILE="$HOME/.claude/settings.json"
mkdir -p "$HOME/.claude"
[ -f "$SETTINGS_FILE" ] || echo '{}' > "$SETTINGS_FILE"

# Clean up old skill-based config if present
rm -rf "$HOME/.claude/skills/shellgate" 2>/dev/null || true

# Remove old env vars and hooks from settings
node -e '
const fs = require("fs");
const f = process.env.HOME + "/.claude/settings.json";
const s = JSON.parse(fs.readFileSync(f, "utf8"));

// Remove old env vars
if (s.env) {
  delete s.env.SHELLGATE_URL;
  delete s.env.SHELLGATE_API_KEY;
  if (Object.keys(s.env).length === 0) delete s.env;
}

// Remove old SessionStart hooks that reference /api/skill
if (s.hooks?.SessionStart) {
  s.hooks.SessionStart = s.hooks.SessionStart.filter(h => {
    if (h.command && h.command.includes("/api/skill")) return false;
    if (h.hooks && h.hooks.some(sub => sub.command && sub.command.includes("/api/skill"))) return false;
    return true;
  });
  if (s.hooks.SessionStart.length === 0) delete s.hooks.SessionStart;
  if (Object.keys(s.hooks).length === 0) delete s.hooks;
}

// Add MCP server config
if (!s.mcpServers) s.mcpServers = {};
s.mcpServers.shellgate = {
  type: "url",
  url: "'"$SHELLGATE_URL"'/mcp",
  headers: {
    Authorization: "Bearer '"$SHELLGATE_API_KEY"'"
  }
};

fs.writeFileSync(f, JSON.stringify(s, null, 2));
'

# Verify connection
if curl -sf -H "Authorization: Bearer $SHELLGATE_API_KEY" "$SHELLGATE_URL/verify-connection" > /dev/null 2>&1; then
  echo "✓ Shellgate MCP configured for Claude Code"
  echo "  Restart Claude Code to activate the MCP server."
else
  echo "⚠ Could not verify connection to Shellgate at $SHELLGATE_URL"
  echo "  MCP config has been written — verify your Shellgate instance is running."
fi
`;
}
```

- [ ] **Step 3: Verify the script generates valid output**

```bash
npm run dev -- --port 5174 &
sleep 3
# Check that the script output looks correct (manual inspection)
curl -s http://localhost:5174/api/install/claude-code -H "Authorization: Bearer test" 2>/dev/null | head -20
kill %1
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/server/utils/install-scripts.ts
git commit -m "feat: update Claude Code install script to register MCP server"
```

---

### Task 10: Add auth enforcement tests for the MCP route

**Files:**
- Modify: `tests/integration/mcp.test.ts`

- [ ] **Step 1: Add auth tests**

Add to `tests/integration/mcp.test.ts`:

```typescript
describe("MCP auth", () => {
	it("rejects requests without bearer token", async () => {
		const handler = createMcpToolHandler;
		// This tests at the service level; the route-level auth is tested
		// by verifying requireBearer is called in the route handler.
		// Route-level test:
		const { POST } = await import("../../src/routes/mcp/+server");
		const request = new Request("http://localhost/mcp", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				jsonrpc: "2.0",
				method: "initialize",
				params: {
					protocolVersion: "2025-03-26",
					capabilities: {},
					clientInfo: { name: "test", version: "0.1" },
				},
				id: 1,
			}),
		});

		try {
			await POST({ request } as any);
			expect.fail("Should have thrown");
		} catch (e: any) {
			expect(e.status).toBe(401);
		}
	});
});
```

- [ ] **Step 2: Run all MCP tests**

```bash
npx vitest run tests/integration/mcp.test.ts --reporter=verbose
```

Expected: All PASS

- [ ] **Step 3: Commit**

```bash
git add tests/integration/mcp.test.ts
git commit -m "test: add MCP auth enforcement tests"
```

---

### Task 11: Update AGENTS.md documentation

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 1: Add MCP route to the agent-facing routes table**

In `AGENTS.md`, add the MCP route to the agent-facing routes table:

```markdown
| `POST /mcp` | MCP server (Streamable HTTP transport) |
```

- [ ] **Step 2: Add MCP section**

Add a new section after the "Request flow" section:

```markdown
### MCP Server

Shellgate exposes all agent-facing functionality as an MCP server at `POST /mcp` using Streamable HTTP transport. Claude Code connects via `mcpServers` config in `~/.claude/settings.json`.

**Tools:** `discover`, `api_request`, `ssh_exec`, `webhook_poll`, `webhook_ack`, `skill_list`, `skill_read`, `skill_upsert`, `skill_delete`

**Auth:** Same bearer token as REST endpoints. Passed via `Authorization` header.

**Instructions:** On initialize, the server sends instructions telling the agent to call `discover` and `skill_list` at session start.
```

- [ ] **Step 3: Commit**

```bash
git add AGENTS.md
git commit -m "docs: add MCP server to AGENTS.md"
```

---

### Task 12: Final verification

- [ ] **Step 1: Run the full test suite**

```bash
npx vitest run --reporter=verbose
```

Expected: All tests pass

- [ ] **Step 2: Start dev server and test MCP handshake end-to-end**

Start the dev server with a test database and verify a full MCP initialize → tools/list flow works:

```bash
npm run dev -- --port 5174 &
sleep 3

# Create a token via the API or use existing one, then test:
# (Replace sg_... with an actual token)
curl -s -X POST http://localhost:5174/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sg_..." \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"0.1"}},"id":1}'

# Should return: serverInfo, capabilities, instructions
kill %1
```

- [ ] **Step 3: Verify TypeScript compilation**

```bash
npx tsc --noEmit
```

Expected: No errors

- [ ] **Step 4: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: address issues found during final verification"
```
