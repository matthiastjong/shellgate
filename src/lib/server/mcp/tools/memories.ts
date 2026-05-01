import type { Token } from "$lib/server/db/schema";
import { addMemory, listMemories, readMemory, deleteMemory } from "$lib/server/services/memories";

function resolveUser(token: Token, requestUser?: string): string | null {
	return token.defaultUser ?? requestUser ?? null;
}

export async function memoryList(
	token: Token,
	args: { visibility?: string; user?: string },
) {
	const resolvedUser = resolveUser(token, args.user);
	const result = await listMemories(token.id, resolvedUser, {
		visibility: args.visibility,
		user: args.user,
	});
	return result;
}

export async function memoryRead(
	token: Token,
	args: { id: string },
) {
	const resolvedUser = resolveUser(token);
	const memory = await readMemory(args.id, token.id, resolvedUser);
	if (!memory) return { error: "Memory not found or not accessible" };
	return {
		id: memory.id,
		summary: memory.summary,
		content: memory.content,
		visibility: memory.visibility,
		user: memory.userIdentifier,
		metadata: memory.metadata,
		createdAt: memory.createdAt,
		updatedAt: memory.updatedAt,
	};
}

export async function memoryAdd(
	token: Token,
	args: {
		summary: string;
		content: string;
		visibility: string;
		user?: string;
		metadata?: Record<string, unknown>;
	},
) {
	if (!args.summary || !args.content || !args.visibility) {
		return { error: "summary, content, and visibility are required" };
	}
	if (!["org", "user", "token"].includes(args.visibility)) {
		return { error: "visibility must be 'org', 'user', or 'token'" };
	}

	const resolvedUser = resolveUser(token, args.user);

	try {
		const memory = await addMemory({
			tokenId: token.id,
			userIdentifier: args.visibility === "org" ? null : resolvedUser,
			visibility: args.visibility as "org" | "user" | "token",
			summary: args.summary,
			content: args.content,
			metadata: args.metadata,
		});
		return {
			id: memory.id,
			summary: memory.summary,
			visibility: memory.visibility,
			user: memory.userIdentifier,
		};
	} catch (err) {
		return { error: err instanceof Error ? err.message : "Failed to add memory" };
	}
}

export async function memoryDelete(
	token: Token,
	args: { id: string },
) {
	const deleted = await deleteMemory(args.id, token.id);
	if (!deleted) return { error: "Memory not found or not owned by this token" };
	return { deleted: true };
}
