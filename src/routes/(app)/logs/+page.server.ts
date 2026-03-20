import { db } from "$lib/server/db";
import { auditLogs, tokens, targets } from "$lib/server/db/schema";
import { and, eq, desc, count, isNull } from "drizzle-orm";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ url }) => {
	const tokenId = url.searchParams.get("tokenId");
	const targetId = url.searchParams.get("targetId");
	const type = url.searchParams.get("type") as "gateway" | "ssh" | null;
	const page = Math.max(Number(url.searchParams.get("page")) || 1, 1);
	const perPage = 50;
	const offset = (page - 1) * perPage;

	const conditions = [];
	if (tokenId) conditions.push(eq(auditLogs.tokenId, tokenId));
	if (targetId) conditions.push(eq(auditLogs.targetId, targetId));
	if (type === "gateway" || type === "ssh") conditions.push(eq(auditLogs.type, type));

	const where = conditions.length > 0 ? and(...conditions) : undefined;

	const [logs, [{ total }], activeTokens, allTargets] = await Promise.all([
		db
			.select()
			.from(auditLogs)
			.where(where)
			.orderBy(desc(auditLogs.createdAt))
			.limit(perPage)
			.offset(offset),
		db.select({ total: count() }).from(auditLogs).where(where),
		db
			.select({ id: tokens.id, name: tokens.name })
			.from(tokens)
			.where(isNull(tokens.revokedAt)),
		db.select({ id: targets.id, name: targets.name, slug: targets.slug }).from(targets),
	]);

	return {
		logs,
		total,
		page,
		perPage,
		filters: { tokenId, targetId, type },
		activeTokens,
		allTargets,
	};
};
