import { describe, expect, it } from "vitest";
import { isUniqueViolation } from "$lib/server/utils/db-error";

describe("isUniqueViolation", () => {
	it("detects code 23505", () => {
		expect(isUniqueViolation({ code: "23505" })).toBe(true);
	});

	it("detects nested cause", () => {
		expect(isUniqueViolation({ cause: { code: "23505" } })).toBe(true);
	});

	it("returns false for other errors", () => {
		expect(isUniqueViolation({ code: "42P01" })).toBe(false);
		expect(isUniqueViolation(null)).toBe(false);
		expect(isUniqueViolation(undefined)).toBe(false);
		expect(isUniqueViolation("string")).toBe(false);
	});
});
