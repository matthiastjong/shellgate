/**
 * OAuth2 service account token exchange with in-memory caching.
 * Signs a RS256 JWT and exchanges it at the token endpoint for an access_token.
 */

import { signRS256JWT } from "./jwt-rs256";

const tokenCache = new Map<string, { accessToken: string; expiresAt: number }>();

export async function getServiceAccountToken(config: {
	privateKey: string;
	clientEmail: string;
	scopes: string;
	tokenUri?: string;
}): Promise<string> {
	const tokenUri = config.tokenUri ?? "https://oauth2.googleapis.com/token";
	const cacheKey = `${config.clientEmail}:${config.scopes}`;

	const cached = tokenCache.get(cacheKey);
	if (cached && cached.expiresAt > Date.now() + 60_000) {
		return cached.accessToken;
	}

	const assertion = await signRS256JWT({
		privateKey: config.privateKey,
		clientEmail: config.clientEmail,
		scopes: config.scopes,
		tokenUri,
	});

	const response = await fetch(tokenUri, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: `grant_type=${encodeURIComponent("urn:ietf:params:oauth:grant_type:jwt-bearer")}&assertion=${encodeURIComponent(assertion)}`,
	});

	if (!response.ok) {
		const body = await response.text();
		throw new Error(`Token exchange failed (${response.status}): ${body}`);
	}

	const data = (await response.json()) as { access_token: string; expires_in: number };
	const expiresAt = Date.now() + data.expires_in * 1000;

	tokenCache.set(cacheKey, { accessToken: data.access_token, expiresAt });

	return data.access_token;
}

/** Clear the token cache (for testing). */
export function clearTokenCache(): void {
	tokenCache.clear();
}
