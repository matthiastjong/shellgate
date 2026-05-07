import type { Token } from "$lib/server/db/schema";
import { searchItems } from "$lib/server/services/vault-items";

export async function vaultSearch(token: Token, args: { query: string }) {
	if (!args.query?.trim()) {
		return { error: "query is required" };
	}

	try {
		const results = await searchItems(token.id, args.query.trim());
		return { results };
	} catch (err) {
		return { error: err instanceof Error ? err.message : "Search failed" };
	}
}
