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
});
