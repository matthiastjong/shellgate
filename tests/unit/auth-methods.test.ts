import { describe, expect, it } from "vitest";
import { computeCredentialHint } from "$lib/server/services/auth-methods";

describe("computeCredentialHint", () => {
	it("masks short credentials", () => {
		expect(computeCredentialHint("short")).toBe("••••••••");
	});

	it("shows prefix and suffix for long credentials", () => {
		expect(computeCredentialHint("sk-1234567890abcdef")).toBe("sk-••••••••cdef");
	});

	it("handles exactly 10 characters", () => {
		const hint = computeCredentialHint("1234567890");
		expect(hint).toBe("123••••••••7890");
	});

	it("masks query_param credential (paramName:value format)", () => {
		const hint = computeCredentialHint("key:abc-semrush-key-1234");
		expect(hint).toBe("key••••••••1234");
	});
});
