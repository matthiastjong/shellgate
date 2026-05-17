function normalizeOrigin(origin: string): string {
	return origin.replace(/\/+$/, "");
}

function originMatches(origin: string, pattern: string): boolean {
	const o = normalizeOrigin(origin);
	const p = normalizeOrigin(pattern);

	if (o === p) return true;

	// Wildcard subdomain: https://*.example.com
	if (p.includes("*.")) {
		const wildcardSuffix = p.replace("*.", "");
		const [scheme] = wildcardSuffix.split("://");
		const suffix = wildcardSuffix.slice(scheme.length + 3); // after "scheme://"
		const [oScheme] = o.split("://");
		const oHost = o.slice(oScheme.length + 3);

		if (scheme !== oScheme) return false;
		// Must have at least one subdomain level (not the apex itself)
		return oHost.endsWith(`.${suffix}`) && oHost !== suffix;
	}

	return false;
}

export function matchesOrigin(origin: string, allowedOrigins: string[] | null | undefined): boolean {
	if (!allowedOrigins || allowedOrigins.length === 0) return true;
	return allowedOrigins.some((pattern) => originMatches(origin, pattern));
}
