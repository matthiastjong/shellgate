import { describe, expect, it } from "vitest";
import { generateToken, hashToken } from "$lib/server/services/tokens";

describe("generateToken", () => {
	it("returns a token with sg_ prefix", () => {
		const token = generateToken();
		expect(token).toMatch(/^sg_[0-9a-f]{64}$/);
	});

	it("generates unique tokens", () => {
		const a = generateToken();
		const b = generateToken();
		expect(a).not.toBe(b);
	});
});

describe("hashToken", () => {
	it("returns a hex SHA-256 hash", () => {
		const hash = hashToken("sg_test");
		expect(hash).toMatch(/^[0-9a-f]{64}$/);
	});

	it("is deterministic", () => {
		const a = hashToken("sg_test");
		const b = hashToken("sg_test");
		expect(a).toBe(b);
	});

	it("different tokens produce different hashes", () => {
		const a = hashToken("sg_one");
		const b = hashToken("sg_two");
		expect(a).not.toBe(b);
	});
});
