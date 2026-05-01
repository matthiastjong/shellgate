import type { PageServerLoad } from "./$types";
import { db } from "$lib/server/db";
import { memories, tokens } from "$lib/server/db/schema";
import { eq, desc } from "drizzle-orm";

export const load: PageServerLoad = async () => {
	const rows = await db
		.select({
			id: memories.id,
			tokenId: memories.tokenId,
			tokenName: tokens.name,
			userIdentifier: memories.userIdentifier,
			visibility: memories.visibility,
			summary: memories.summary,
			content: memories.content,
			metadata: memories.metadata,
			createdAt: memories.createdAt,
			updatedAt: memories.updatedAt,
		})
		.from(memories)
		.leftJoin(tokens, eq(memories.tokenId, tokens.id))
		.orderBy(desc(memories.updatedAt))
		.limit(500);

	return { memories: rows };
};
