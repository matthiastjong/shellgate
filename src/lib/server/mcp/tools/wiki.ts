import type { Token } from "$lib/server/db/schema";
import {
	listWikiPages,
	getWikiPage,
	upsertWikiPage,
	archiveWikiPage,
	lintWikiContent,
} from "$lib/server/services/wiki";

export async function wikiListPages(args: { namespace?: string; status?: string; tag?: string }) {
	const result = await listWikiPages({
		namespace: args.namespace,
		status: args.status,
		tag: args.tag,
	});
	return result;
}

export async function wikiReadPage(args: { namespace?: string; slug: string }) {
	const namespace = args.namespace ?? "general";
	const page = await getWikiPage(namespace, args.slug);
	if (!page) return { error: "Page not found" };
	return {
		id: page.id,
		namespace: page.namespace,
		slug: page.slug,
		title: page.title,
		summary: page.summary,
		tags: page.tags,
		body: page.body,
		sources: page.sources,
		status: page.status,
		version: page.version,
		updatedBy: page.updatedBy,
		createdAt: page.createdAt,
		updatedAt: page.updatedAt,
	};
}

export async function wikiUpsertPage(
	token: Token,
	args: {
		namespace?: string;
		slug: string;
		title: string;
		body: string;
		summary?: string;
		tags?: string[];
		sources?: Array<{ type: string; title?: string; uri?: string; retrievedAt?: string }>;
		status?: string;
		expectedVersion?: number;
	},
) {
	if (!args.slug || !args.title || !args.body) {
		return { error: "slug, title, and body are required" };
	}
	if (args.status && !["draft", "active", "archived"].includes(args.status)) {
		return { error: "status must be 'draft', 'active', or 'archived'" };
	}

	try {
		const page = await upsertWikiPage({
			namespace: args.namespace,
			slug: args.slug,
			title: args.title,
			body: args.body,
			summary: args.summary,
			tags: args.tags,
			sources: args.sources as any,
			status: args.status as any,
			expectedVersion: args.expectedVersion,
			updatedBy: token.name,
		});
		return {
			slug: page.slug,
			namespace: page.namespace,
			version: page.version,
			updatedAt: page.updatedAt,
		};
	} catch (err) {
		return { error: err instanceof Error ? err.message : "Failed to upsert page" };
	}
}

export async function wikiDeletePage(args: { namespace?: string; slug: string }) {
	const namespace = args.namespace ?? "general";
	const archived = await archiveWikiPage(namespace, args.slug);
	if (!archived) return { error: "Page not found or already archived" };
	return { archived: true, slug: args.slug };
}

export async function wikiLintPage(args: {
	namespace?: string;
	slug?: string;
	title?: string;
	body?: string;
	sources?: Array<{ type: string; title?: string; uri?: string; retrievedAt?: string }>;
}) {
	let title: string;
	let body: string;
	let sources = args.sources as any;

	if (args.slug) {
		const namespace = args.namespace ?? "general";
		const page = await getWikiPage(namespace, args.slug);
		if (!page) return { error: "Page not found" };
		title = page.title;
		body = page.body;
		sources = page.sources;
	} else {
		if (!args.title || !args.body) {
			return { error: "Either slug (for existing page) or title+body (for direct lint) is required" };
		}
		title = args.title;
		body = args.body;
	}

	const pages = await listWikiPages({ status: "all" });
	const existingSlugs = pages.map((p) => p.slug);

	return lintWikiContent({ title, body, sources, existingSlugs });
}
