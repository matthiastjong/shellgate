import { describe, expect, it } from "vitest";
import { ipToInt } from "$lib/server/utils/ip";

describe("ipToInt", () => {
	it("converts valid IPv4 addresses", () => {
		expect(ipToInt("0.0.0.0")).toBe(0);
		expect(ipToInt("127.0.0.1")).toBe(0x7f000001);
		expect(ipToInt("192.168.1.1")).toBe(0xc0a80101);
		expect(ipToInt("255.255.255.255")).toBe(0xffffffff);
	});

	it("returns null for invalid addresses", () => {
		expect(ipToInt("")).toBeNull();
		expect(ipToInt("abc")).toBeNull();
		expect(ipToInt("1.2.3")).toBeNull();
		expect(ipToInt("1.2.3.4.5")).toBeNull();
		expect(ipToInt("256.0.0.1")).toBeNull();
		expect(ipToInt("-1.0.0.1")).toBeNull();
	});
});
