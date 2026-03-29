import { and, eq, desc } from "drizzle-orm";
import { db } from "../db";
import { guardRules } from "../db/schema";
import type { GuardRule } from "../db/schema";

export async function listGuardRules(targetId: string): Promise<GuardRule[]> {
	return db
		.select()
		.from(guardRules)
		.where(eq(guardRules.targetId, targetId))
		.orderBy(desc(guardRules.priority));
}

export async function createGuardRule(
	targetId: string,
	data: {
		field: "command" | "method" | "path" | "query";
		operator: "contains" | "equals" | "starts_with";
		value: string;
		action: "allow" | "block" | "approval_required";
		reason: string;
		priority?: number;
	},
): Promise<GuardRule> {
	const [rule] = await db
		.insert(guardRules)
		.values({
			targetId,
			field: data.field,
			operator: data.operator,
			value: data.value,
			action: data.action,
			reason: data.reason,
			priority: data.priority ?? 0,
		})
		.returning();
	return rule;
}

export async function updateGuardRule(
	targetId: string,
	id: string,
	data: Partial<{
		field: "command" | "method" | "path" | "query";
		operator: "contains" | "equals" | "starts_with";
		value: string;
		action: "allow" | "block" | "approval_required";
		reason: string;
		priority: number;
		enabled: boolean;
	}>,
): Promise<GuardRule | null> {
	const [rule] = await db
		.update(guardRules)
		.set(data)
		.where(and(eq(guardRules.id, id), eq(guardRules.targetId, targetId)))
		.returning();
	return rule ?? null;
}

export async function deleteGuardRule(
	targetId: string,
	id: string,
): Promise<boolean> {
	const result = await db
		.delete(guardRules)
		.where(and(eq(guardRules.id, id), eq(guardRules.targetId, targetId)))
		.returning({ id: guardRules.id });
	return result.length > 0;
}
