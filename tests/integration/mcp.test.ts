import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { truncateAll, createTestToken, createTestTarget, grantPermission, createTestAuthMethod, createTestWebhookEndpoint } from "../helpers";
import { createMcpToolHandler } from "$lib/server/mcp/server";
import { db } from "$lib/server/db";
import { tokens } from "$lib/server/db/schema";
import type { Token } from "$lib/server/db/schema";
import { eq } from "drizzle-orm";

async function getFullToken(tokenId: string): Promise<Token> {
	const [row] = await db.select().from(tokens).where(eq(tokens.id, tokenId)).limit(1);
	return row;
}

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
			expect(result.request).toEqual({ type: "ssh", command: "rm -rf /tmp/old" });
			expect(result.next_action).toContain("approved: true");
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
