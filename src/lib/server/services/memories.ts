import { and, eq, or, desc, sql } from "drizzle-orm";
import { db } from "../db";
import { memories } from "../db/schema";

type AddMemoryInput = {
	tokenId: string;
	userIdentifier: string | null;
	visibility: "org" | "user" | "token";
	summary: string;
	content: string;
	metadata?: Record<string, unknown>;
};

export async function addMemory(input: AddMemoryInput) {
	if (input.visibility === "user" && !input.userIdentifier) {
		throw new Error("user visibility requires a user identifier");
	}
	if (input.summary.length > 500) {
		throw new Error("summary must be 500 characters or less");
	}

	const [row] = await db
		.insert(memories)
		.values({
			tokenId: input.tokenId,
			userIdentifier: input.userIdentifier,
			visibility: input.visibility,
			summary: input.summary,
			content: input.content,
			metadata: input.metadata ?? {},
		})
		.returning();
	return row;
}

const LIST_LIMIT = 101; // 100 + 1 to detect hasMore

export async function listMemories(
	tokenId: string,
	resolvedUser?: string | null,
	filters?: { visibility?: string; user?: string },
) {
	const conditions = [
		or(
			eq(memories.visibility, "org"),
			...(resolvedUser
				? [and(eq(memories.visibility, "user"), eq(memories.userIdentifier, resolvedUser))]
				: []),
			and(eq(memories.visibility, "token"), eq(memories.tokenId, tokenId)),
		),
	];

	if (filters?.visibility) {
		conditions.push(eq(memories.visibility, filters.visibility));
	}
	if (filters?.user) {
		conditions.push(eq(memories.userIdentifier, filters.user));
	}

	const rows = await db
		.select({
			id: memories.id,
			summary: memories.summary,
			visibility: memories.visibility,
			user: memories.userIdentifier,
			metadata: memories.metadata,
			updatedAt: memories.updatedAt,
		})
		.from(memories)
		.where(and(...conditions))
		.orderBy(desc(memories.updatedAt))
		.limit(LIST_LIMIT);

	return {
		memories: rows.slice(0, 100),
		hasMore: rows.length > 100,
	};
}

export async function readMemory(
	id: string,
	tokenId: string,
	resolvedUser: string | null,
) {
	const [row] = await db
		.select()
		.from(memories)
		.where(eq(memories.id, id))
		.limit(1);

	if (!row) return null;

	// Check visibility access
	if (row.visibility === "org") return row;
	if (row.visibility === "user" && resolvedUser && row.userIdentifier === resolvedUser) return row;
	if (row.visibility === "token" && row.tokenId === tokenId) return row;

	return null;
}

export async function deleteMemory(id: string, tokenId: string) {
	const result = await db
		.delete(memories)
		.where(and(eq(memories.id, id), eq(memories.tokenId, tokenId)))
		.returning({ id: memories.id });
	return result.length > 0;
}

export async function countMemories(
	tokenId: string,
	resolvedUser?: string | null,
) {
	const [result] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(memories)
		.where(
			or(
				eq(memories.visibility, "org"),
				...(resolvedUser
					? [and(eq(memories.visibility, "user"), eq(memories.userIdentifier, resolvedUser))]
					: []),
				and(eq(memories.visibility, "token"), eq(memories.tokenId, tokenId)),
			),
		);
	return result.count;
}
