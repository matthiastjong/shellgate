import { listTargets } from "$lib/server/services/targets";
import { listTokens } from "$lib/server/services/tokens";
import { db } from "$lib/server/db";
import { auditLogs, tokens } from "$lib/server/db/schema";
import { desc, gte, isNotNull, or, and } from "drizzle-orm";
import { sql } from "drizzle-orm";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async () => {
	const [targetsData, tokensData] = await Promise.all([
		listTargets(),
		listTokens(),
	]);

	const totalAuthMethods = targetsData.reduce(
		(sum, t) => sum + (t.authMethodCount ?? 0),
		0,
	);

	// Get today's date at midnight (start of day)
	const todayStart = new Date();
	todayStart.setHours(0, 0, 0, 0);

	// Count requests today
	const requestsTodayResult = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(auditLogs)
		.where(gte(auditLogs.createdAt, todayStart));

	const requestsToday = requestsTodayResult[0]?.count ?? 0;

	// Get recent activity (last 8 requests)
	const recentActivity = await db
		.select({
			id: auditLogs.id,
			tokenName: auditLogs.tokenName,
			targetSlug: auditLogs.targetSlug,
			type: auditLogs.type,
			method: auditLogs.method,
			path: auditLogs.path,
			statusCode: auditLogs.statusCode,
			durationMs: auditLogs.durationMs,
			createdAt: auditLogs.createdAt,
		})
		.from(auditLogs)
		.orderBy(desc(auditLogs.createdAt))
		.limit(8);

	// Get active agents (tokens with lastUsedAt set)
	const activeAgents = await db
		.select({
			id: tokens.id,
			name: tokens.name,
			lastUsedAt: tokens.lastUsedAt,
		})
		.from(tokens)
		.where(isNotNull(tokens.lastUsedAt))
		.orderBy(desc(tokens.lastUsedAt));

	// Get tokens that have never been used
	const neverUsedAgents = await db
		.select({
			id: tokens.id,
			name: tokens.name,
			lastUsedAt: tokens.lastUsedAt,
		})
		.from(tokens)
		.where(sql`${tokens.lastUsedAt} IS NULL AND ${tokens.revokedAt} IS NULL`)
		.orderBy(tokens.name);

	// Check for errors in last 24h
	const last24h = new Date();
	last24h.setHours(last24h.getHours() - 24);

	const errorsResult = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(auditLogs)
		.where(
			and(
				gte(auditLogs.createdAt, last24h),
				or(
					and(
						gte(auditLogs.statusCode, 400),
						sql`${auditLogs.statusCode} < 600`,
					),
				),
			),
		);

	const errorsLast24h = errorsResult[0]?.count ?? 0;

	return {
		stats: {
			totalTargets: targetsData.length,
			activeTargets: targetsData.filter((t) => t.enabled !== false).length,
			totalApiKeys: tokensData.length,
			activeApiKeys: tokensData.filter((t) => !t.revokedAt).length,
			revokedApiKeys: tokensData.filter((t) => t.revokedAt).length,
			totalAuthMethods,
			requestsToday,
		},
		recentActivity,
		activeAgents: [...activeAgents, ...neverUsedAgents],
		errorsLast24h,
	};
};
