import { ipToInt } from "./ip";

const BLOCKED_HOSTNAMES = ["localhost", "metadata.google.internal"];

const BLOCKED_RANGES = [
	{ start: 0x7f000000, end: 0x7fffffff }, // 127.0.0.0/8 (loopback)
	{ start: 0x0a000000, end: 0x0affffff }, // 10.0.0.0/8
	{ start: 0xac100000, end: 0xac1fffff }, // 172.16.0.0/12
	{ start: 0xc0a80000, end: 0xc0a8ffff }, // 192.168.0.0/16
	{ start: 0xa9fe0000, end: 0xa9feffff }, // 169.254.0.0/16 (link-local / cloud metadata)
	{ start: 0x00000000, end: 0x00ffffff }, // 0.0.0.0/8
];

function isPrivateIp(hostname: string): boolean {
	const ip = ipToInt(hostname);
	if (ip === null) return false;
	return BLOCKED_RANGES.some((r) => ip >= r.start && ip <= r.end);
}

export function validateBaseUrl(raw: string): string | null {
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		return "base_url is not a valid URL";
	}

	if (url.protocol !== "https:" && url.protocol !== "http:") {
		return "base_url must use http or https";
	}

	if (BLOCKED_HOSTNAMES.includes(url.hostname)) {
		return "base_url points to a blocked host";
	}

	if (isPrivateIp(url.hostname)) {
		return "base_url must not point to a private/internal IP";
	}

	return null;
}
