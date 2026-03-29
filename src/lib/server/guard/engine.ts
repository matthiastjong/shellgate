import type { NormalizedRequest } from "./normalize";
import type { Rule, RuleAction } from "./rules";
import type { GuardRule } from "../db/schema";

export type GuardResult =
	| { action: "allow" }
	| { action: "block"; reason: string; matched: string }
	| { action: "approval_required"; reason: string; matched: string };

function matchesRule(
	normalized: NormalizedRequest,
	field: string,
	operator: string,
	value: string,
): boolean {
	let subject: string | undefined;

	switch (field) {
		case "command":
			subject = normalized.command;
			break;
		case "method":
			subject = normalized.method;
			break;
		case "path":
			subject = normalized.path;
			break;
		case "query":
			subject = normalized.path;
			break;
		default:
			return false;
	}

	if (subject === undefined) return false;

	const lowerSubject = subject.toLowerCase();
	const lowerValue = value.toLowerCase();

	switch (operator) {
		case "contains":
			return lowerSubject.includes(lowerValue);
		case "equals":
			return lowerSubject === lowerValue;
		case "starts_with":
			return lowerSubject.startsWith(lowerValue);
		default:
			return false;
	}
}

export function evaluate(
	normalized: NormalizedRequest,
	builtinRules: Rule[],
	userRules: GuardRule[],
): GuardResult {
	// Sort user rules by priority DESC (higher priority first)
	const sortedUserRules = [...userRules].sort((a, b) => b.priority - a.priority);

	// Step 1: Check if any user "allow" rule explicitly overrides a built-in "approval_required"
	for (const rule of sortedUserRules) {
		if (rule.action !== "allow") continue;
		if (matchesRule(normalized, rule.field, rule.operator, rule.value)) {
			return { action: "allow" };
		}
	}

	// Step 2: Check built-in rules
	for (const rule of builtinRules) {
		if (matchesRule(normalized, rule.field, rule.operator, rule.value)) {
			return {
				action: rule.action as Exclude<RuleAction, "allow">,
				reason: rule.reason,
				matched: rule.value,
			};
		}
	}

	// Step 3: Check remaining user rules (non-allow)
	for (const rule of sortedUserRules) {
		if (rule.action === "allow") continue; // already checked above
		if (matchesRule(normalized, rule.field, rule.operator, rule.value)) {
			return {
				action: rule.action as Exclude<RuleAction, "allow">,
				reason: rule.reason,
				matched: rule.value,
			};
		}
	}

	// Step 4: No match → allow
	return { action: "allow" };
}
