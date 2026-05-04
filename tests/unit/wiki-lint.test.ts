import { describe, expect, it } from "vitest";

describe("lintWikiPage", () => {
	it("returns valid for good content", async () => {
		const { lintWikiContent } = await import("$lib/server/services/wiki");
		const result = lintWikiContent({
			title: "SEO Analysis",
			body: "## Overview\n\nTraffic data here.",
		});
		expect(result.valid).toBe(true);
		expect(result.errors).toHaveLength(0);
	});

	it("errors on empty title", async () => {
		const { lintWikiContent } = await import("$lib/server/services/wiki");
		const result = lintWikiContent({ title: "", body: "Content." });
		expect(result.valid).toBe(false);
		expect(result.errors).toContainEqual(expect.stringContaining("title"));
	});

	it("errors on empty body", async () => {
		const { lintWikiContent } = await import("$lib/server/services/wiki");
		const result = lintWikiContent({ title: "Title", body: "" });
		expect(result.valid).toBe(false);
		expect(result.errors).toContainEqual(expect.stringContaining("body"));
	});

	it("errors on body exceeding 50000 chars", async () => {
		const { lintWikiContent } = await import("$lib/server/services/wiki");
		const result = lintWikiContent({ title: "Title", body: "x".repeat(50001) });
		expect(result.valid).toBe(false);
		expect(result.errors).toContainEqual(expect.stringContaining("50000"));
	});

	it("errors on source missing type", async () => {
		const { lintWikiContent } = await import("$lib/server/services/wiki");
		const result = lintWikiContent({
			title: "Title",
			body: "Content.",
			sources: [{ title: "No type" } as any],
		});
		expect(result.valid).toBe(false);
		expect(result.errors).toContainEqual(expect.stringContaining("type"));
	});

	it("errors on url source missing uri", async () => {
		const { lintWikiContent } = await import("$lib/server/services/wiki");
		const result = lintWikiContent({
			title: "Title",
			body: "Content.",
			sources: [{ type: "url", title: "Missing URI" }],
		});
		expect(result.valid).toBe(false);
		expect(result.errors).toContainEqual(expect.stringContaining("uri"));
	});

	it("accepts manual source without uri", async () => {
		const { lintWikiContent } = await import("$lib/server/services/wiki");
		const result = lintWikiContent({
			title: "Title",
			body: "Content.",
			sources: [{ type: "manual", title: "Hand-written" }],
		});
		expect(result.valid).toBe(true);
	});

	it("warns on memory-like content", async () => {
		const { lintWikiContent } = await import("$lib/server/services/wiki");
		const result = lintWikiContent({
			title: "Title",
			body: "Focus content op New Balance, niet Nike.",
		});
		expect(result.warnings).toContainEqual(expect.stringContaining("memory"));
	});

	it("warns on skill-like content", async () => {
		const { lintWikiContent } = await import("$lib/server/services/wiki");
		const result = lintWikiContent({
			title: "Title",
			body: "Stap 1: Open de terminal\nStap 2: Run het commando\nStap 3: Check de output",
		});
		expect(result.warnings).toContainEqual(expect.stringContaining("skill"));
	});

	it("warns on broken wiki links", async () => {
		const { lintWikiContent } = await import("$lib/server/services/wiki");
		const result = lintWikiContent({
			title: "Title",
			body: "See [[non-existent-page]] for details.",
			existingSlugs: ["some-other-page"],
		});
		expect(result.warnings).toContainEqual(expect.stringContaining("non-existent-page"));
	});

	it("does not warn on valid wiki links", async () => {
		const { lintWikiContent } = await import("$lib/server/services/wiki");
		const result = lintWikiContent({
			title: "Title",
			body: "See [[existing-page]] for details.",
			existingSlugs: ["existing-page"],
		});
		expect(result.warnings).toHaveLength(0);
	});
});
