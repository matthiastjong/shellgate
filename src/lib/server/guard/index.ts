import { getBuiltinRules } from "./rules";
import { evaluate } from "./engine";
import type { NormalizedRequest } from "./normalize";
import type { GuardResult } from "./engine";

export type { GuardResult } from "./engine";
export { normalizeApiRequest, normalizeSshRequest } from "./normalize";
export { getBuiltinRules, BUILTIN_SSH_RULES, BUILTIN_API_RULES } from "./rules";
export type { Rule, RuleAction, RuleField, RuleOperator } from "./rules";

export async function checkRequest(normalized: NormalizedRequest): Promise<GuardResult> {
	const rules = getBuiltinRules(normalized.type);
	return evaluate(normalized, rules);
}
