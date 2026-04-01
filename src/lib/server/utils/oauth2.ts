/**
 * OAuth2 refresh token flow — exchanges a refresh token for a fresh access token.
 * Includes in-memory caching so we don't hit the token endpoint on every request.
 */

interface OAuth2RefreshConfig {
	clientId: string;
	clientSecret: string;
	refreshToken: string;
	tokenUrl?: string; // defaults to Google's token endpoint
}

interface CachedToken {
	accessToken: string;
	expiresAt: number; // epoch ms
}

// In-memory cache keyed by "clientId:refreshToken" hash
const tokenCache = new Map<string, CachedToken>();

function cacheKey(config: OAuth2RefreshConfig): string {
	return `${config.clientId}:${config.refreshToken.slice(-8)}`;
}

export async function getOAuth2AccessToken(config: OAuth2RefreshConfig): Promise<string> {
	const key = cacheKey(config);
	const cached = tokenCache.get(key);

	// Return cached token if still valid (with 60s buffer)
	if (cached && cached.expiresAt > Date.now() + 60_000) {
		return cached.accessToken;
	}

	const tokenUrl = config.tokenUrl || "https://oauth2.googleapis.com/token";

	const response = await fetch(tokenUrl, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			client_id: config.clientId,
			client_secret: config.clientSecret,
			refresh_token: config.refreshToken,
			grant_type: "refresh_token",
		}),
	});

	if (!response.ok) {
		const body = await response.text();
		throw new Error(`OAuth2 token refresh failed (${response.status}): ${body}`);
	}

	const data = await response.json();
	const accessToken = data.access_token as string;
	const expiresIn = (data.expires_in as number) || 3600;

	tokenCache.set(key, {
		accessToken,
		expiresAt: Date.now() + expiresIn * 1000,
	});

	return accessToken;
}