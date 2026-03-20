import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireAdmin } from "$lib/server/api-auth";
import { db } from "$lib/server/db";
import { auditLogs } from "$lib/server/db/schema";
import { and, eq, desc, sql, count } from "drizzle-orm";

export const GET: RequestHandler = async ({ request, url }) => {
	await requireAdmin(request);

	const tokenId = url.searchParams.get("tokenId");
	const targetId = url.searchParams.get("targetId");
	const type = url.searchParams.get("type");
	const limit = Math.min(Number(url.searchParams.get("limit")) || 50, 200);
	const offset = Number(url.searchParams.get("offset")) || 0;

	const conditions = [];
	if (tokenId) conditions.push(eq(auditLogs.tokenId, tokenId));
	if (targetId) conditions.push(eq(auditLogs.targetId, targetId));
	if (type === "gateway" || type === "ssh") conditions.push(eq(auditLogs.type, type));

	const where = conditions.length > 0 ? and(...conditions) : undefined;

	const [logs, [{ total }]] = await Promise.all([
		db
			.select()
			.from(auditLogs)
			.where(where)
			.orderBy(desc(auditLogs.createdAt))
			.limit(limit)
			.offset(offset),
		db
			.select({ total: count() })
			.from(auditLogs)
			.where(where),
	]);

	return Response.json({ logs, total });
};
