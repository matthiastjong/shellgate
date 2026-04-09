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

	it("shows header name for single JSON custom_header", () => {
		const credential = JSON.stringify([{ name: "X-API-Key", value: "secret" }]);
		expect(computeCredentialHint(credential, "custom_header")).toBe("Header: X-API-Key");
	});

	it("shows count and names for multiple JSON custom_headers", () => {
		const credential = JSON.stringify([
			{ name: "X-API-Key", value: "key1" },
			{ name: "X-Secret", value: "key2" },
		]);
		expect(computeCredentialHint(credential, "custom_header")).toBe("2 headers: X-API-Key, X-Secret");
	});

	it("falls through to default hint for legacy custom_header format", () => {
		const hint = computeCredentialHint("X-API-Key: my-secret-value", "custom_header");
		expect(hint).toBe("X-A••••••••alue");
	});
});
