import { describe, expect, it } from "vitest";
import { matchesOrigin } from "$lib/server/utils/origin-match";

describe("matchesOrigin", () => {
	it("matches exact origin", () => {
		expect(matchesOrigin("https://github.com", ["https://github.com"])).toBe(true);
	});

	it("rejects different origin", () => {
		expect(matchesOrigin("https://evil.com", ["https://github.com"])).toBe(false);
	});

	it("matches wildcard subdomain", () => {
		expect(matchesOrigin("https://gist.github.com", ["https://*.github.com"])).toBe(true);
		expect(matchesOrigin("https://raw.github.com", ["https://*.github.com"])).toBe(true);
	});

	it("wildcard does not match apex domain", () => {
		expect(matchesOrigin("https://github.com", ["https://*.github.com"])).toBe(false);
	});

	it("requires scheme match", () => {
		expect(matchesOrigin("http://github.com", ["https://github.com"])).toBe(false);
	});

	it("matches with port", () => {
		expect(matchesOrigin("https://localhost:3000", ["https://localhost:3000"])).toBe(true);
		expect(matchesOrigin("https://localhost:3001", ["https://localhost:3000"])).toBe(false);
	});

	it("matches any from multiple allowed", () => {
		expect(matchesOrigin("https://github.com", ["https://gitlab.com", "https://github.com"])).toBe(true);
	});

	it("returns true for empty allowedOrigins (unrestricted)", () => {
		expect(matchesOrigin("https://anything.com", [])).toBe(true);
		expect(matchesOrigin("https://anything.com", null as unknown as string[])).toBe(true);
	});

	it("handles trailing slashes gracefully", () => {
		expect(matchesOrigin("https://github.com/", ["https://github.com"])).toBe(true);
		expect(matchesOrigin("https://github.com", ["https://github.com/"])).toBe(true);
	});
});
