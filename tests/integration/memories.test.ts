import { beforeEach, describe, expect, it } from "vitest";
import { createTestToken, truncateAll } from "../helpers";

describe("memories service", () => {
	beforeEach(async () => {
		await truncateAll();
	});

	it("adds an org-level memory", async () => {
		const { addMemory } = await import("$lib/server/services/memories");
		const { token } = await createTestToken();

		const memory = await addMemory({
			tokenId: token.id,
			userIdentifier: null,
			visibility: "org",
			summary: "Sneakerbaron deploys via Coolify",
			content: "Sneakerbaron is hosted on Hetzner and deploys via Coolify. Repo: github.com/example/sneakerbaron",
			metadata: { project: "sneakerbaron" },
		});

		expect(memory.id).toBeDefined();
		expect(memory.visibility).toBe("org");
		expect(memory.summary).toBe("Sneakerbaron deploys via Coolify");
		expect(memory.content).toContain("Coolify");
		expect(memory.metadata).toEqual({ project: "sneakerbaron" });
	});

	it("lists memories with correct visibility filtering", async () => {
		const { addMemory, listMemories } = await import("$lib/server/services/memories");
		const { token: token1 } = await createTestToken("Agent Matthias");
		const { token: token2 } = await createTestToken("Agent Bedran");

		// Org memory — visible to everyone
		await addMemory({
			tokenId: token1.id,
			userIdentifier: null,
			visibility: "org",
			summary: "Org fact",
			content: "Org fact content",
		});

		// User memory for matthias — visible to matthias only
		await addMemory({
			tokenId: token1.id,
			userIdentifier: "matthias",
			visibility: "user",
			summary: "Matthias preference",
			content: "Matthias preference content",
		});

		// Token memory for token1 — visible to token1 only
		await addMemory({
			tokenId: token1.id,
			userIdentifier: null,
			visibility: "token",
			summary: "Token1 private",
			content: "Token1 private content",
		});

		// Token memory for token2 — visible to token2 only
		await addMemory({
			tokenId: token2.id,
			userIdentifier: null,
			visibility: "token",
			summary: "Token2 private",
			content: "Token2 private content",
		});

		// Matthias via token1 sees: org + user:matthias + token1
		const result1 = await listMemories(token1.id, "matthias");
		expect(result1.memories).toHaveLength(3);
		expect(result1.hasMore).toBe(false);

		// Bedran via token2 sees: org + token2 (not matthias' user memory, not token1)
		const result2 = await listMemories(token2.id, "bedran");
		expect(result2.memories).toHaveLength(2);
		const summaries2 = result2.memories.map((m) => m.summary);
		expect(summaries2).toContain("Org fact");
		expect(summaries2).toContain("Token2 private");
		expect(summaries2).not.toContain("Matthias preference");
		expect(summaries2).not.toContain("Token1 private");
	});

	it("reads a memory with visibility check", async () => {
		const { addMemory, readMemory } = await import("$lib/server/services/memories");
		const { token: token1 } = await createTestToken();
		const { token: token2 } = await createTestToken();

		const memory = await addMemory({
			tokenId: token1.id,
			userIdentifier: null,
			visibility: "token",
			summary: "Private to token1",
			content: "Secret content",
		});

		// Token1 can read its own memory
		const result1 = await readMemory(memory.id, token1.id, null);
		expect(result1).not.toBeNull();
		expect(result1!.content).toBe("Secret content");

		// Token2 cannot read token1's private memory
		const result2 = await readMemory(memory.id, token2.id, null);
		expect(result2).toBeNull();
	});

	it("reads org memory from any token", async () => {
		const { addMemory, readMemory } = await import("$lib/server/services/memories");
		const { token: token1 } = await createTestToken();
		const { token: token2 } = await createTestToken();

		const memory = await addMemory({
			tokenId: token1.id,
			userIdentifier: null,
			visibility: "org",
			summary: "Org fact",
			content: "Visible to all",
		});

		const result = await readMemory(memory.id, token2.id, null);
		expect(result).not.toBeNull();
		expect(result!.content).toBe("Visible to all");
	});

	it("deletes own memory", async () => {
		const { addMemory, deleteMemory, readMemory } = await import("$lib/server/services/memories");
		const { token } = await createTestToken();

		const memory = await addMemory({
			tokenId: token.id,
			userIdentifier: null,
			visibility: "org",
			summary: "To be deleted",
			content: "Will be gone",
		});

		const result = await deleteMemory(memory.id, token.id);
		expect(result).toBe(true);

		const gone = await readMemory(memory.id, token.id, null);
		expect(gone).toBeNull();
	});

	it("cannot delete another token's memory", async () => {
		const { addMemory, deleteMemory } = await import("$lib/server/services/memories");
		const { token: token1 } = await createTestToken();
		const { token: token2 } = await createTestToken();

		const memory = await addMemory({
			tokenId: token1.id,
			userIdentifier: null,
			visibility: "org",
			summary: "Token1 created",
			content: "Token1 content",
		});

		const result = await deleteMemory(memory.id, token2.id);
		expect(result).toBe(false);
	});

	it("counts accessible memories", async () => {
		const { addMemory, countMemories } = await import("$lib/server/services/memories");
		const { token } = await createTestToken();

		await addMemory({ tokenId: token.id, userIdentifier: null, visibility: "org", summary: "One", content: "1" });
		await addMemory({ tokenId: token.id, userIdentifier: "matthias", visibility: "user", summary: "Two", content: "2" });
		await addMemory({ tokenId: token.id, userIdentifier: null, visibility: "token", summary: "Three", content: "3" });

		const count = await countMemories(token.id, "matthias");
		expect(count).toBe(3);
	});

	it("rejects user visibility without user identifier", async () => {
		const { addMemory } = await import("$lib/server/services/memories");
		const { token } = await createTestToken();

		await expect(
			addMemory({
				tokenId: token.id,
				userIdentifier: null,
				visibility: "user",
				summary: "No user",
				content: "Should fail",
			}),
		).rejects.toThrow("user visibility requires a user identifier");
	});

	it("rejects summary over 500 characters", async () => {
		const { addMemory } = await import("$lib/server/services/memories");
		const { token } = await createTestToken();

		await expect(
			addMemory({
				tokenId: token.id,
				userIdentifier: null,
				visibility: "org",
				summary: "x".repeat(501),
				content: "Content",
			}),
		).rejects.toThrow("summary must be 500 characters or less");
	});
});
