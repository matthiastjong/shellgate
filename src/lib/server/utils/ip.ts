export function ipToInt(ip: string): number | null {
	const parts = ip.split(".");
	if (parts.length !== 4) return null;
	let result = 0;
	for (const part of parts) {
		const n = Number.parseInt(part, 10);
		if (Number.isNaN(n) || n < 0 || n > 255) return null;
		result = (result << 8) | n;
	}
	return result >>> 0;
}
