import { describe, expect, it } from "vitest";
import { verifySignature } from "$lib/server/utils/hmac";
import { createHmac } from "node:crypto";

describe("verifySignature", () => {
	const secret = "test-secret-key";
	const body = '{"action":"create","data":{}}';

	it("returns true for valid HMAC-SHA256 signature", () => {
		const expected = createHmac("sha256", secret).update(body).digest("hex");
		expect(verifySignature(secret, body, expected)).toBe(true);
	});

	it("returns false for invalid signature", () => {
		expect(verifySignature(secret, body, "invalid-signature")).toBe(false);
	});

	it("returns true when signature has sha256= prefix", () => {
		const hash = createHmac("sha256", secret).update(body).digest("hex");
		expect(verifySignature(secret, body, `sha256=${hash}`)).toBe(true);
	});

	it("is timing-safe (does not throw on length mismatch)", () => {
		expect(verifySignature(secret, body, "short")).toBe(false);
	});
});
