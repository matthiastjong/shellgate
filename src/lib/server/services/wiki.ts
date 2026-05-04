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

type LintInput = {
	title: string;
	body: string;
	sources?: WikiSourceRef[];
	existingSlugs?: string[];
};

type LintResult = {
	valid: boolean;
	errors: string[];
	warnings: string[];
};

const REQUIRES_URI_TYPES = ["url", "mcp", "semrush"];
const VALID_SOURCE_TYPES = ["url", "file", "mcp", "manual", "semrush"];

export function lintWikiContent(input: LintInput): LintResult {
	const errors: string[] = [];
	const warnings: string[] = [];

	// Title checks
	if (!input.title || input.title.trim().length === 0) {
		errors.push("title is required and must not be empty");
	}

	// Body checks
	if (!input.body || input.body.trim().length === 0) {
		errors.push("body is required and must not be empty");
	} else if (input.body.length > 50000) {
		errors.push("body exceeds maximum length of 50000 characters");
	}

	// Source checks
	if (input.sources) {
		for (let i = 0; i < input.sources.length; i++) {
			const src = input.sources[i];
			if (!src.type || !VALID_SOURCE_TYPES.includes(src.type)) {
				errors.push(`source[${i}]: type is required and must be one of ${VALID_SOURCE_TYPES.join(", ")}`);
			} else if (REQUIRES_URI_TYPES.includes(src.type) && !src.uri) {
				errors.push(`source[${i}]: uri is required for type "${src.type}"`);
			}
		}
	}

	// Boundary check: memory-like content
	if (input.body) {
		const memoryPatterns = [
			/\bfocus\s+(content\s+)?op\b/i,
			/\bniet\s+\w+,?\s+(maar|wel)\b/i,
			/\baltijd\s+\w+\s+(gebruiken|doen|vermijden)\b/i,
			/\bvoorkeur\s+voor\b/i,
		];
		if (memoryPatterns.some((p) => p.test(input.body))) {
			warnings.push(
				"Body contains memory-like content (behavioral instructions). Consider storing this as a memory instead.",
			);
		}
	}

	// Boundary check: skill-like content
	if (input.body) {
		const stepPattern = /^stap\s+\d+[:.].*$/gim;
		const matches = input.body.match(stepPattern);
		if (matches && matches.length >= 3) {
			warnings.push(
				"Body contains skill-like content (step-by-step instructions). Consider storing this as a skill instead.",
			);
		}
	}

	// Broken wiki links
	if (input.body && input.existingSlugs) {
		const linkPattern = /\[\[([a-z0-9][a-z0-9-]*[a-z0-9]?)\]\]/g;
		let match;
		while ((match = linkPattern.exec(input.body)) !== null) {
			if (!input.existingSlugs.includes(match[1])) {
				warnings.push(`Broken wiki link: [[${match[1]}]] — page not found`);
			}
		}
	}

	return { valid: errors.length === 0, errors, warnings };
}
