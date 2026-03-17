import { describe, expect, it } from "vitest";
import { createSession, validateSession } from "$lib/server/auth";

const SECRET = "test-secret-password";

describe("session auth", () => {
	it("creates a valid session", () => {
		const session = createSession("admin@test.com", SECRET);
		expect(session).toContain("admin@test.com");
		expect(session).toContain(".");
	});

	it("validates a correct session", () => {
		const session = createSession("admin@test.com", SECRET);
		expect(validateSession(session, SECRET)).toBe(true);
	});

	it("rejects a tampered session", () => {
		const session = createSession("admin@test.com", SECRET);
		const tampered = session.replace("admin", "hacker");
		expect(validateSession(tampered, SECRET)).toBe(false);
	});

	it("rejects with wrong secret", () => {
		const session = createSession("admin@test.com", SECRET);
		expect(validateSession(session, "wrong-secret")).toBe(false);
	});

	it("rejects malformed input", () => {
		expect(validateSession("no-dot-here", SECRET)).toBe(false);
	});
});
