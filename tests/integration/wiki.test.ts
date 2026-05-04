import { beforeEach, describe, expect, it } from "vitest";
import { truncateAll } from "../helpers";

describe("wiki service", () => {
	beforeEach(async () => {
		await truncateAll();
	});

	it("creates a new page via upsert", async () => {
		const { upsertWikiPage } = await import("$lib/server/services/wiki");
		const page = await upsertWikiPage({
			slug: "seo-analysis",
			title: "SEO Analysis Q1 2026",
			body: "## Overview\n\nTraffic increased 15%.",
			updatedBy: "agent-1",
		});

		expect(page.slug).toBe("seo-analysis");
		expect(page.namespace).toBe("general");
		expect(page.version).toBe(1);
		expect(page.title).toBe("SEO Analysis Q1 2026");
	});

	it("creates a page with all optional fields", async () => {
		const { upsertWikiPage, getWikiPage } = await import("$lib/server/services/wiki");
		await upsertWikiPage({
			namespace: "sneakerbaron",
			slug: "brand-guide",
			title: "Brand Guide",
			body: "Content here.",
			summary: "Overview of brand guidelines",
			tags: ["brand", "marketing"],
			sources: [{ type: "url", title: "Source 1", uri: "https://example.com" }],
			status: "draft",
			updatedBy: "agent-1",
		});

		const page = await getWikiPage("sneakerbaron", "brand-guide");
		expect(page).not.toBeNull();
		expect(page!.summary).toBe("Overview of brand guidelines");
		expect(page!.tags).toEqual(["brand", "marketing"]);
		expect(page!.sources).toEqual([{ type: "url", title: "Source 1", uri: "https://example.com" }]);
		expect(page!.status).toBe("draft");
	});

	it("updates an existing page with correct expectedVersion", async () => {
		const { upsertWikiPage } = await import("$lib/server/services/wiki");
		await upsertWikiPage({
			slug: "seo-analysis",
			title: "SEO Analysis",
			body: "Original content.",
			updatedBy: "agent-1",
		});

		const updated = await upsertWikiPage({
			slug: "seo-analysis",
			title: "SEO Analysis Updated",
			body: "Updated content.",
			expectedVersion: 1,
			updatedBy: "agent-2",
		});

		expect(updated.version).toBe(2);
		expect(updated.title).toBe("SEO Analysis Updated");
	});

	it("rejects update with wrong expectedVersion", async () => {
		const { upsertWikiPage } = await import("$lib/server/services/wiki");
		await upsertWikiPage({
			slug: "seo-analysis",
			title: "SEO Analysis",
			body: "Content.",
			updatedBy: "agent-1",
		});

		await expect(
			upsertWikiPage({
				slug: "seo-analysis",
				title: "SEO Analysis",
				body: "New content.",
				expectedVersion: 5,
				updatedBy: "agent-2",
			}),
		).rejects.toThrow("Version conflict");
	});

	it("upserts same namespace+slug without expectedVersion (overwrites)", async () => {
		const { upsertWikiPage } = await import("$lib/server/services/wiki");
		await upsertWikiPage({
			slug: "seo-analysis",
			title: "V1",
			body: "First.",
			updatedBy: "agent-1",
		});

		const updated = await upsertWikiPage({
			slug: "seo-analysis",
			title: "V2",
			body: "Second.",
			updatedBy: "agent-2",
		});

		expect(updated.version).toBe(2);
	});

	it("gets a page by namespace and slug", async () => {
		const { upsertWikiPage, getWikiPage } = await import("$lib/server/services/wiki");
		await upsertWikiPage({
			slug: "arch-doc",
			title: "Architecture",
			body: "Details.",
			updatedBy: "agent-1",
		});

		const page = await getWikiPage("general", "arch-doc");
		expect(page).not.toBeNull();
		expect(page!.body).toBe("Details.");
	});

	it("returns null for non-existent page", async () => {
		const { getWikiPage } = await import("$lib/server/services/wiki");
		const page = await getWikiPage("general", "non-existent");
		expect(page).toBeNull();
	});

	it("lists pages without body", async () => {
		const { upsertWikiPage, listWikiPages } = await import("$lib/server/services/wiki");
		await upsertWikiPage({ slug: "page-1", title: "Page 1", body: "Body 1.", updatedBy: "a" });
		await upsertWikiPage({ slug: "page-2", title: "Page 2", body: "Body 2.", updatedBy: "a" });

		const list = await listWikiPages();
		expect(list).toHaveLength(2);
		expect(list[0]).toHaveProperty("slug");
		expect(list[0]).toHaveProperty("title");
		expect(list[0]).not.toHaveProperty("body");
	});

	it("lists pages filtered by namespace", async () => {
		const { upsertWikiPage, listWikiPages } = await import("$lib/server/services/wiki");
		await upsertWikiPage({ slug: "p1", title: "P1", body: "B.", updatedBy: "a" });
		await upsertWikiPage({ namespace: "sneakerbaron", slug: "p2", title: "P2", body: "B.", updatedBy: "a" });

		const list = await listWikiPages({ namespace: "sneakerbaron" });
		expect(list).toHaveLength(1);
		expect(list[0].slug).toBe("p2");
	});

	it("lists only active pages by default", async () => {
		const { upsertWikiPage, archiveWikiPage, listWikiPages } = await import("$lib/server/services/wiki");
		await upsertWikiPage({ slug: "active-page", title: "Active", body: "B.", updatedBy: "a" });
		await upsertWikiPage({ slug: "archived-page", title: "Archived", body: "B.", updatedBy: "a" });
		await archiveWikiPage("general", "archived-page");

		const list = await listWikiPages();
		expect(list).toHaveLength(1);
		expect(list[0].slug).toBe("active-page");
	});

	it("lists pages filtered by tag", async () => {
		const { upsertWikiPage, listWikiPages } = await import("$lib/server/services/wiki");
		await upsertWikiPage({ slug: "p1", title: "P1", body: "B.", tags: ["seo", "analysis"], updatedBy: "a" });
		await upsertWikiPage({ slug: "p2", title: "P2", body: "B.", tags: ["brand"], updatedBy: "a" });

		const list = await listWikiPages({ tag: "seo" });
		expect(list).toHaveLength(1);
		expect(list[0].slug).toBe("p1");
	});

	it("archives a page (soft delete)", async () => {
		const { upsertWikiPage, archiveWikiPage, getWikiPage } = await import("$lib/server/services/wiki");
		await upsertWikiPage({ slug: "to-delete", title: "Delete Me", body: "B.", updatedBy: "a" });

		const result = await archiveWikiPage("general", "to-delete");
		expect(result).toBe(true);

		const page = await getWikiPage("general", "to-delete");
		expect(page!.status).toBe("archived");
	});

	it("returns false when archiving non-existent page", async () => {
		const { archiveWikiPage } = await import("$lib/server/services/wiki");
		const result = await archiveWikiPage("general", "non-existent");
		expect(result).toBe(false);
	});

	it("returns false when archiving already archived page", async () => {
		const { upsertWikiPage, archiveWikiPage } = await import("$lib/server/services/wiki");
		await upsertWikiPage({ slug: "page", title: "Page", body: "B.", updatedBy: "a" });
		await archiveWikiPage("general", "page");

		const result = await archiveWikiPage("general", "page");
		expect(result).toBe(false);
	});

	it("validates slug format", async () => {
		const { upsertWikiPage } = await import("$lib/server/services/wiki");
		await expect(
			upsertWikiPage({ slug: "INVALID SLUG!", title: "T", body: "B.", updatedBy: "a" }),
		).rejects.toThrow("slug");
	});

	it("counts wiki pages", async () => {
		const { upsertWikiPage, countWikiPages } = await import("$lib/server/services/wiki");
		await upsertWikiPage({ slug: "p1", title: "P1", body: "B.", updatedBy: "a" });
		await upsertWikiPage({ slug: "p2", title: "P2", body: "B.", updatedBy: "a" });

		const count = await countWikiPages();
		expect(count).toBe(2);
	});
});
