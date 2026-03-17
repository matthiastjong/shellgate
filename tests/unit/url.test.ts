import { describe, expect, it } from "vitest";
import { validateBaseUrl } from "$lib/server/utils/url";

describe("validateBaseUrl", () => {
	it("accepts valid public URLs", () => {
		expect(validateBaseUrl("https://api.example.com")).toBeNull();
		expect(validateBaseUrl("http://api.example.com/v1")).toBeNull();
	});

	it("rejects invalid URLs", () => {
		expect(validateBaseUrl("not-a-url")).not.toBeNull();
	});

	it("rejects non-http protocols", () => {
		expect(validateBaseUrl("ftp://example.com")).not.toBeNull();
	});

	it("rejects localhost", () => {
		expect(validateBaseUrl("http://localhost:3000")).not.toBeNull();
	});

	it("rejects metadata endpoint", () => {
		expect(validateBaseUrl("http://metadata.google.internal")).not.toBeNull();
	});

	it("rejects private IPs", () => {
		expect(validateBaseUrl("http://127.0.0.1")).not.toBeNull();
		expect(validateBaseUrl("http://10.0.0.1")).not.toBeNull();
		expect(validateBaseUrl("http://192.168.1.1")).not.toBeNull();
		expect(validateBaseUrl("http://172.16.0.1")).not.toBeNull();
		expect(validateBaseUrl("http://169.254.169.254")).not.toBeNull();
	});
});
