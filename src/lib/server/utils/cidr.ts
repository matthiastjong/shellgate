import { ipToInt } from "./ip";

export function ipMatchesCidr(ip: string, cidr: string): boolean {
	const [cidrIp, prefixStr] = cidr.split("/");
	const prefix = prefixStr !== undefined ? Number.parseInt(prefixStr, 10) : 32;

	if (Number.isNaN(prefix) || prefix < 0 || prefix > 32) return false;

	const ipInt = ipToInt(ip);
	const cidrInt = ipToInt(cidrIp);

	if (ipInt === null || cidrInt === null) return false;

	if (prefix === 0) return true;

	const mask = (~0 << (32 - prefix)) >>> 0;
	return (ipInt & mask) === (cidrInt & mask);
}

export function ipMatchesAny(ip: string, allowedIps: string[]): boolean {
	return allowedIps.some((cidr) => ipMatchesCidr(ip, cidr));
}
