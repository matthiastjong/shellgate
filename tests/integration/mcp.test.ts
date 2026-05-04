import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { truncateAll, createTestToken, createTestTarget, grantPermission, createTestAuthMethod, createTestWebhookEndpoint } from "../helpers";
import { createMcpToolHandler } from "$lib/server/mcp/server";
import { createEvent } from "$lib/server/services/webhook-events";
import { createSkill } from "$lib/server/services/skills";
import { db } from "$lib/server/db";
import { tokens } from "$lib/server/db/schema";
import type { Token } from "$lib/server/db/schema";
import { eq } from "drizzle-orm";

async function getFullToken(tokenId: string): Promise<Token> {
	const [row] = await db.select().from(tokens).where(eq(tokens.id, tokenId)).limit(1);
	return row;
}

describe("MCP auth", () => {
	it("rejects requests without bearer token", async () => {
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

describe("MCP tools", () => {
	beforeEach(async () => {
		await truncateAll();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("discover", () => {
		it("returns targets, webhooks, and skills accessible to the token", async () => {
			const { token, plainToken } = await createTestToken();
			const target = await createTestTarget("OpenAI", "https://api.openai.com");
			await createTestAuthMethod(target.id);
			await grantPermission(token.id, target.id);
			await createTestWebhookEndpoint(token.id, { name: "Linear" });

			const handler = createMcpToolHandler(token);
			const result = await handler("discover", {}) as { targets: Array<{ slug: string }>; webhooks: unknown[]; skills: unknown[] };

			expect(result).toHaveProperty("targets");
			expect(result).toHaveProperty("webhooks");
			expect(result).toHaveProperty("skills");
			expect(result.targets).toHaveLength(1);
			expect(result.targets[0].slug).toBe(target.slug);
			expect(result.webhooks).toHaveLength(1);
		});

		it("returns empty arrays when token has no permissions", async () => {
			const { token } = await createTestToken();
			const handler = createMcpToolHandler(token);
			const result = await handler("discover", {}) as { targets: unknown[]; webhooks: unknown[] };

			expect(result.targets).toHaveLength(0);
			expect(result.webhooks).toHaveLength(0);
		});
	});

	describe("ssh_exec", () => {
		it("returns approval_required for a destructive command without approved flag", async () => {
			const { token: tokenRow } = await createTestToken();
			const target = await createTestTarget("DeployServer", "https://unused.example.com");
			await grantPermission(tokenRow.id, target.id);

			// Update target to SSH type with config
			const { db } = await import("$lib/server/db");
			const { targets: targetsTable } = await import("$lib/server/db/schema");
			const { eq } = await import("drizzle-orm");
			await db.update(targetsTable).set({
				type: "ssh",
				config: { host: "10.0.0.1", port: 22, username: "deploy" },
			}).where(eq(targetsTable.id, target.id));

			await createTestAuthMethod(target.id, { type: "ssh_key", credential: "-----BEGIN OPENSSH PRIVATE KEY-----\nfake\n-----END OPENSSH PRIVATE KEY-----" });

			const fullToken = await getFullToken(tokenRow.id);

			const handler = createMcpToolHandler(fullToken);
			const result = await handler("ssh_exec", {
				target: target.slug,
				command: "rm -rf /tmp/old",
			}) as { status: string; reason: string; matched: string; next_action: string; request: { type: string; command: string } };

			expect(result.status).toBe("approval_required");
			expect(result.reason).toContain("rm -r");
			expect(result.matched).toBe("rm -r");
			expect(result.request).toEqual({ target: "deployserver", command: "rm -rf /tmp/old", timeout: undefined });
			expect(result.next_action).toContain("approved: true");
		});
	});

	describe("webhook_poll", () => {
		it("returns pending events for the token's endpoints", async () => {
			const { token } = await createTestToken();
			const endpoint = await createTestWebhookEndpoint(token.id, { name: "GitHub" });
			await createEvent(endpoint.id, { "content-type": "application/json" }, { action: "opened" });

			const handler = createMcpToolHandler(token);
			const result = await handler("webhook_poll", {}) as { events: Array<{ endpointName: string; body: unknown }> };

			expect(result).toHaveProperty("events");
			expect(result.events).toHaveLength(1);
			expect(result.events[0].endpointName).toBe("GitHub");
			expect(result.events[0].body).toEqual({ action: "opened" });
		});

		it("returns empty events when no pending events exist", async () => {
			const { token } = await createTestToken();
			const handler = createMcpToolHandler(token);
			const result = await handler("webhook_poll", {}) as { events: unknown[] };

			expect(result.events).toHaveLength(0);
		});
	});

	describe("webhook_ack", () => {
		it("acknowledges events by id and returns count", async () => {
			const { token } = await createTestToken();
			const endpoint = await createTestWebhookEndpoint(token.id, { name: "Stripe" });
			await createEvent(endpoint.id, { "x-stripe-signature": "abc" }, { type: "payment.succeeded" });

			const handler = createMcpToolHandler(token);
			const pollResult = await handler("webhook_poll", {}) as { events: Array<{ id: string }> };
			expect(pollResult.events).toHaveLength(1);

			const eventId = pollResult.events[0].id;
			const ackResult = await handler("webhook_ack", { eventIds: [eventId] }) as { acknowledged: number };

			expect(ackResult.acknowledged).toBe(1);

			// Polling again should return no pending events
			const pollAgain = await handler("webhook_poll", {}) as { events: unknown[] };
			expect(pollAgain.events).toHaveLength(0);
		});

		it("returns error when eventIds is empty", async () => {
			const { token } = await createTestToken();
			const handler = createMcpToolHandler(token);
			const result = await handler("webhook_ack", { eventIds: [] }) as { error: string };

			expect(result.error).toContain("eventIds is required");
		});

		it("returns error when eventIds is not provided", async () => {
			const { token } = await createTestToken();
			const handler = createMcpToolHandler(token);
			const result = await handler("webhook_ack", {}) as { error: string };

			expect(result.error).toContain("eventIds is required");
		});

		it("does not acknowledge events belonging to another token", async () => {
			const { token: token1 } = await createTestToken();
			const { token: token2 } = await createTestToken();
			const endpoint = await createTestWebhookEndpoint(token1.id, { name: "Linear" });
			const event = await createEvent(endpoint.id, {}, { payload: "data" });

			const handler2 = createMcpToolHandler(token2);
			const ackResult = await handler2("webhook_ack", { eventIds: [event.id] }) as { acknowledged: number };

			expect(ackResult.acknowledged).toBe(0);
		});
	});

	describe("org_skill_list", () => {
		it("returns array with slug and description", async () => {
			const { token } = await createTestToken();
			await createSkill("---\nname: test-skill\ndescription: A test skill\n---\n# Test\nSome content.");

			const handler = createMcpToolHandler(token);
			const result = await handler("org_skill_list", {}) as Array<{ slug: string; description: string }>;

			expect(Array.isArray(result)).toBe(true);
			// Includes built-in skills + 1 DB skill
			const dbSkills = result.filter((s) => !s.builtIn);
			expect(dbSkills).toHaveLength(1);
			expect(dbSkills[0].slug).toBe("test-skill");
			expect(dbSkills[0].description).toBe("A test skill");
		});
	});

	describe("org_skill_read", () => {
		it("returns full skill content", async () => {
			const { token } = await createTestToken();
			const content = "---\nname: my-skill\ndescription: My skill description\n---\n# My Skill\nDoes stuff.";
			await createSkill(content);

			const handler = createMcpToolHandler(token);
			const result = await handler("org_skill_read", { slug: "my-skill" }) as { slug: string; description: string; content: string; version: number };

			expect(result.slug).toBe("my-skill");
			expect(result.description).toBe("My skill description");
			expect(result.content).toBe(content);
			expect(result.version).toBe(1);
		});

		it("returns error for nonexistent slug", async () => {
			const { token } = await createTestToken();

			const handler = createMcpToolHandler(token);
			const result = await handler("org_skill_read", { slug: "does-not-exist" }) as { error: string };

			expect(result.error).toContain("does-not-exist");
		});
	});

	describe("org_skill_upsert", () => {
		it("creates a new skill and returns slug and version", async () => {
			const { token } = await createTestToken();
			const content = "---\nname: new-skill\ndescription: Brand new skill\n---\n# New Skill\nContent here.";

			const handler = createMcpToolHandler(token);
			const result = await handler("org_skill_upsert", { content }) as { slug: string; version: number };

			expect(result.slug).toBe("new-skill");
			expect(result.version).toBe(1);
		});

		it("updates an existing skill and returns version >= 2", async () => {
			const { token } = await createTestToken();
			const original = "---\nname: existing-skill\ndescription: Original description\n---\n# Original\nOld content.";
			await createSkill(original);

			const updated = "---\nname: existing-skill\ndescription: Updated description\n---\n# Updated\nNew content.";

			const handler = createMcpToolHandler(token);
			const result = await handler("org_skill_upsert", { content: updated }) as { slug: string; version: number };

			expect(result.slug).toBe("existing-skill");
			expect(result.version).toBeGreaterThanOrEqual(2);
		});
	});

	describe("org_skill_delete", () => {
		it("deletes a skill and returns { deleted: true }", async () => {
			const { token } = await createTestToken();
			await createSkill("---\nname: delete-me\ndescription: To be deleted\n---\n# Delete Me\nContent.");

			const handler = createMcpToolHandler(token);
			const result = await handler("org_skill_delete", { slug: "delete-me" }) as { deleted: boolean };

			expect(result.deleted).toBe(true);
		});

		it("returns error when skill not found", async () => {
			const { token } = await createTestToken();

			const handler = createMcpToolHandler(token);
			const result = await handler("org_skill_delete", { slug: "ghost-skill" }) as { error: string };

			expect(result.error).toContain("ghost-skill");
		});
	});

	describe("api_request", () => {
		it("proxies a GET request to the upstream target", async () => {
			const { token: tokenRow } = await createTestToken();
			const target = await createTestTarget("OpenAI", "https://api.openai.com");
			await createTestAuthMethod(target.id, { credential: "sk-test-1234567890" });
			await grantPermission(tokenRow.id, target.id);

			const fullToken = await getFullToken(tokenRow.id);

			const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
				new Response(JSON.stringify({ models: [] }), {
					status: 200,
					headers: { "content-type": "application/json" },
				}),
			);

			const handler = createMcpToolHandler(fullToken);
			const result = await handler("api_request", {
				target: target.slug,
				method: "GET",
				path: "v1/models",
			}) as { status: number; headers: Record<string, string>; body: unknown };

			expect(result.status).toBe(200);
			expect(result.body).toEqual({ models: [] });
			expect(fetchSpy).toHaveBeenCalledOnce();
			const [url, init] = fetchSpy.mock.calls[0];
			expect(url).toBe("https://api.openai.com/v1/models");
			expect((init!.headers as Headers).get("Authorization")).toBe("Bearer sk-test-1234567890");
		});

		it("returns approval_required for a DELETE request without approved flag", async () => {
			const { token: tokenRow } = await createTestToken();
			const target = await createTestTarget("SomeAPI", "https://api.example.com");
			await createTestAuthMethod(target.id);
			await grantPermission(tokenRow.id, target.id);

			const fullToken = await getFullToken(tokenRow.id);

			const handler = createMcpToolHandler(fullToken);
			const result = await handler("api_request", {
				target: target.slug,
				method: "DELETE",
				path: "v1/resource/123",
			}) as { status: string; reason: string; matched: string; next_action: string };

			expect(result.status).toBe("approval_required");
			expect(result.reason).toContain("DELETE");
			expect(result.matched).toBe("DELETE");
			expect(result.next_action).toContain("approved: true");
		});
	});
});
