const counts = new Map<string, { count: number; resetAt: number }>();

/** Returns true if the request is within the rate limit (max requests per minute). */
export function checkRateLimit(key: string, max = 100): boolean {
	const now = Date.now();
	const entry = counts.get(key);
	if (!entry || entry.resetAt < now) {
		counts.set(key, { count: 1, resetAt: now + 60_000 });
		return true;
	}
	if (entry.count >= max) return false;
	entry.count++;
	return true;
}
