import { describe, expect, it } from "vitest";
import { ipMatchesCidr, ipMatchesAny } from "$lib/server/utils/cidr";

describe("ipMatchesCidr", () => {
	it("matches exact IPs (/32)", () => {
		expect(ipMatchesCidr("10.0.0.1", "10.0.0.1/32")).toBe(true);
		expect(ipMatchesCidr("10.0.0.2", "10.0.0.1/32")).toBe(false);
	});

	it("matches subnets", () => {
		expect(ipMatchesCidr("192.168.1.100", "192.168.1.0/24")).toBe(true);
		expect(ipMatchesCidr("192.168.2.1", "192.168.1.0/24")).toBe(false);
		expect(ipMatchesCidr("10.0.0.1", "10.0.0.0/8")).toBe(true);
	});

	it("treats bare IP as /32", () => {
		expect(ipMatchesCidr("1.2.3.4", "1.2.3.4")).toBe(true);
		expect(ipMatchesCidr("1.2.3.5", "1.2.3.4")).toBe(false);
	});

	it("/0 matches everything", () => {
		expect(ipMatchesCidr("8.8.8.8", "0.0.0.0/0")).toBe(true);
	});

	it("returns false for invalid inputs", () => {
		expect(ipMatchesCidr("abc", "10.0.0.0/8")).toBe(false);
		expect(ipMatchesCidr("10.0.0.1", "abc/8")).toBe(false);
	});
});

describe("ipMatchesAny", () => {
	it("returns true if any CIDR matches", () => {
		expect(ipMatchesAny("10.0.0.5", ["192.168.0.0/16", "10.0.0.0/24"])).toBe(true);
	});

	it("returns false if none match", () => {
		expect(ipMatchesAny("8.8.8.8", ["10.0.0.0/8", "192.168.0.0/16"])).toBe(false);
	});

	it("returns false for empty list", () => {
		expect(ipMatchesAny("10.0.0.1", [])).toBe(false);
	});
});
