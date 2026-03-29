import type { NormalizedRequest } from "./normalize";
import type { GuardResult } from "./engine";
import { evaluate } from "./engine";
import { getBuiltinRules } from "./rules";
import { listGuardRules } from "../services/guard-rules";

export type { GuardResult } from "./engine";
export { normalizeApiRequest, normalizeSshRequest } from "./normalize";
export { getBuiltinRules, BUILTIN_SSH_RULES, BUILTIN_API_RULES } from "./rules";
export type { Rule, RuleAction, RuleField, RuleOperator } from "./rules";

export async function checkRequest(
	normalized: NormalizedRequest,
	targetId: string,
): Promise<GuardResult> {
	const builtinRules = getBuiltinRules(normalized.type);
	const userRules = await listGuardRules(targetId);
	const enabledUserRules = userRules.filter((r) => r.enabled);
	return evaluate(normalized, builtinRules, enabledUserRules);
}
