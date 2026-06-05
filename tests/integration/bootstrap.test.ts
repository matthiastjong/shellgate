import { describe, it, expect, beforeEach } from "vitest";
import { truncateAll, createTestToken, createTestTarget, grantPermission, createTestMemory, createTestWikiPage } from "../helpers";
import { createMcpToolHandler } from "$lib/server/mcp/server";
import { db } from "$lib/server/db";
import { tokens } from "$lib/server/db/schema";
import type { Token } from "$lib/server/db/schema";
import { eq } from "drizzle-orm";

async function getFullToken(tokenId: string): Promise<Token> {
	const [row] = await db.select().from(tokens).where(eq(tokens.id, tokenId)).limit(1);
	return row;
}

describe("bootstrap MCP tool", () => {
	beforeEach(async () => {
		await truncateAll();
	});

	it("returns targets, skills, webhooks, memories, and wiki_pages", async () => {
		const { token } = await createTestToken();
		const target = await createTestTarget("TestAPI", "https://api.example.com");
		await grantPermission(token.id, target.id);

		const fullToken = await getFullToken(token.id);

		await createTestMemory(token.id, {
			summary: "Don't mock databases",
			visibility: "org",
		});
		await createTestWikiPage({
			namespace: "architecture",
			slug: "overview",
			title: "Architecture Overview",
			summary: "System architecture docs",
		});

		const handler = createMcpToolHandler(fullToken);
		const result = await handler("bootstrap", {}) as {
			targets: Array<{ slug: string; type: string }>;
			skills: unknown[];
			webhooks: unknown[];
			memories: Array<{ slug: string; summary: string }>;
			wiki_pages: Array<{ slug: string; title: string; description: string | null }>;
			vaults: unknown[];
		};

		// Targets
		expect(result.targets).toHaveLength(1);
		expect(result.targets[0].slug).toBe(target.slug);

		// Skills (at least built-in ones)
		expect(Array.isArray(result.skills)).toBe(true);

		// Memories — index only
		expect(result.memories).toHaveLength(1);
		expect(result.memories[0]).toMatchObject({
			slug: expect.any(String),
			summary: "Don't mock databases",
		});
		expect(result.memories[0]).not.toHaveProperty("content");

		// Wiki pages — index only
		expect(result.wiki_pages).toHaveLength(1);
		expect(result.wiki_pages[0]).toMatchObject({
			slug: "architecture/overview",
			title: "Architecture Overview",
			description: "System architecture docs",
		});
		expect(result.wiki_pages[0]).not.toHaveProperty("body");
	});

	it("only includes memories visible to the token", async () => {
		const { token: token1 } = await createTestToken();
		const { token: token2 } = await createTestToken();

		await createTestMemory(token2.id, {
			summary: "Private to other token",
			visibility: "token",
		});
		await createTestMemory(token1.id, {
			summary: "Org-wide memory",
			visibility: "org",
		});

		const fullToken = await getFullToken(token1.id);
		const handler = createMcpToolHandler(fullToken);
		const result = await handler("bootstrap", {}) as {
			memories: Array<{ summary: string }>;
		};

		expect(result.memories).toHaveLength(1);
		expect(result.memories[0].summary).toBe("Org-wide memory");
	});

	it("includes a policy string in the response", async () => {
		const { token } = await createTestToken();
		const fullToken = await getFullToken(token.id);
		const handler = createMcpToolHandler(fullToken);
		const result = await handler("bootstrap", {}) as {
			policy: string;
		};

		expect(result.policy).toEqual(expect.any(String));
		expect(result.policy.length).toBeGreaterThan(0);
		expect(result.policy).toContain("Shellgate");
	});

	it("discover is an alias for bootstrap", async () => {
		const { token } = await createTestToken();
		const fullToken = await getFullToken(token.id);
		const handler = createMcpToolHandler(fullToken);

		const bootstrapResult = await handler("bootstrap", {});
		const discoverResult = await handler("discover", {});

		expect(bootstrapResult).toEqual(discoverResult);
	});
});
