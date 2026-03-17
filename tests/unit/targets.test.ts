import { describe, expect, it } from "vitest";
import { slugify } from "$lib/server/services/targets";

describe("slugify", () => {
	it("converts to lowercase kebab-case", () => {
		expect(slugify("My API Service")).toBe("my-api-service");
	});

	it("strips leading/trailing hyphens", () => {
		expect(slugify("--hello--")).toBe("hello");
	});

	it("collapses multiple special chars", () => {
		expect(slugify("foo   bar__baz")).toBe("foo-bar-baz");
	});

	it("returns empty for non-alphanumeric input", () => {
		expect(slugify("!!!")).toBe("");
	});
});
