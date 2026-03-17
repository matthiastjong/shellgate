import { describe, expect, it } from "vitest";
import { createSession, validateSession } from "$lib/server/auth";

describe("session auth", () => {
	it("creates a valid session", () => {
		const session = createSession("admin@test.com");
		expect(session).toContain("admin@test.com");
		expect(session).toContain(".");
	});

	it("validates a correct session", () => {
		const session = createSession("admin@test.com");
		expect(validateSession(session)).toBe(true);
	});

	it("rejects a tampered session", () => {
		const session = createSession("admin@test.com");
		const tampered = session.replace("admin", "hacker");
		expect(validateSession(tampered)).toBe(false);
	});

	it("rejects malformed input", () => {
		expect(validateSession("no-dot-here")).toBe(false);
	});
});
