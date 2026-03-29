import type { NormalizedRequest } from "./normalize";
import type { Rule, RuleAction } from "./rules";

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
): GuardResult {
	// Check built-in rules
	for (const rule of builtinRules) {
		if (matchesRule(normalized, rule.field, rule.operator, rule.value)) {
			return {
				action: rule.action as Exclude<RuleAction, "allow">,
				reason: rule.reason,
				matched: rule.value,
			};
		}
	}

	// No match → allow
	return { action: "allow" };
}
