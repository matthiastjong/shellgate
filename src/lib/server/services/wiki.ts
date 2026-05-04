import { eq, and, sql, desc, count } from "drizzle-orm";
import { db } from "../db";
import { wikiPages } from "../db/schema";
import type { WikiSourceRef } from "../db/schema";
import { validateSlug } from "../utils/skill-parser";

type UpsertWikiPageInput = {
	namespace?: string;
	slug: string;
	title: string;
	body: string;
	summary?: string;
	tags?: string[];
	sources?: WikiSourceRef[];
	status?: "draft" | "active" | "archived";
	expectedVersion?: number;
	updatedBy?: string;
};

type ListWikiPagesFilters = {
	namespace?: string;
	status?: string;
	tag?: string;
};

export async function listWikiPages(filters?: ListWikiPagesFilters) {
	const conditions = [];

	const statusFilter = filters?.status ?? "active";
	if (statusFilter !== "all") {
		conditions.push(eq(wikiPages.status, statusFilter));
	}

	if (filters?.namespace) {
		conditions.push(eq(wikiPages.namespace, filters.namespace));
	}

	const rows = await db
		.select({
			slug: wikiPages.slug,
			title: wikiPages.title,
			namespace: wikiPages.namespace,
			tags: wikiPages.tags,
			summary: wikiPages.summary,
			status: wikiPages.status,
			version: wikiPages.version,
			updatedAt: wikiPages.updatedAt,
			updatedBy: wikiPages.updatedBy,
		})
		.from(wikiPages)
		.where(conditions.length > 0 ? and(...conditions) : undefined)
		.orderBy(desc(wikiPages.updatedAt))
		.limit(200);

	if (filters?.tag) {
		return rows.filter((r) => r.tags?.includes(filters.tag!));
	}

	return rows;
}

export async function getWikiPage(namespace: string, slug: string) {
	const [row] = await db
		.select()
		.from(wikiPages)
		.where(and(eq(wikiPages.namespace, namespace), eq(wikiPages.slug, slug)))
		.limit(1);
	return row ?? null;
}

export async function upsertWikiPage(input: UpsertWikiPageInput) {
	const namespace = input.namespace ?? "general";
	const slug = input.slug;

	if (!validateSlug(slug) && !(slug.length > 0 && slug.length <= 128 && /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(slug))) {
		throw new Error(`Invalid slug: "${slug}". Must be 1-128 lowercase alphanumeric + hyphens, no consecutive hyphens.`);
	}

	if (!input.title || input.title.trim().length === 0) {
		throw new Error("title is required");
	}

	if (!input.body || input.body.trim().length === 0) {
		throw new Error("body is required");
	}

	const existing = await getWikiPage(namespace, slug);

	if (existing) {
		if (input.expectedVersion !== undefined && input.expectedVersion !== existing.version) {
			throw new Error(
				`Version conflict: expected ${input.expectedVersion}, found ${existing.version}`,
			);
		}

		const [row] = await db
			.update(wikiPages)
			.set({
				title: input.title,
				body: input.body,
				summary: input.summary ?? existing.summary,
				tags: input.tags ?? existing.tags,
				sources: input.sources ?? existing.sources,
				status: input.status ?? existing.status,
				updatedBy: input.updatedBy ?? existing.updatedBy,
				version: sql`${wikiPages.version} + 1`,
				updatedAt: new Date(),
			})
			.where(
				and(eq(wikiPages.namespace, namespace), eq(wikiPages.slug, slug)),
			)
			.returning();
		return row;
	}

	const [row] = await db
		.insert(wikiPages)
		.values({
			namespace,
			slug,
			title: input.title,
			body: input.body,
			summary: input.summary,
			tags: input.tags ?? [],
			sources: input.sources ?? [],
			status: input.status ?? "active",
			updatedBy: input.updatedBy,
		})
		.returning();
	return row;
}

export async function archiveWikiPage(namespace: string, slug: string) {
	const existing = await getWikiPage(namespace, slug);
	if (!existing || existing.status === "archived") return false;

	await db
		.update(wikiPages)
		.set({ status: "archived", updatedAt: new Date() })
		.where(
			and(eq(wikiPages.namespace, namespace), eq(wikiPages.slug, slug)),
		);
	return true;
}

export async function countWikiPages() {
	const [row] = await db
		.select({ value: count() })
		.from(wikiPages)
		.where(eq(wikiPages.status, "active"));
	return row?.value ?? 0;
}
