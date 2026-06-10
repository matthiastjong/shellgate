/**
 * Static registry of OAuth integration providers.
 * Provider credentials come from environment variables — never stored in the database.
 */

import { env } from "$env/dynamic/private";

export interface ProviderConfig {
	name: string;
	authUrl: string;
	tokenUrl: string;
	scopes: string;
	graphBaseUrl: string;
}

const PROVIDERS: Record<string, ProviderConfig> = {
	microsoft_365: {
		name: "Microsoft 365",
		authUrl: "https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize",
		tokenUrl: "https://login.microsoftonline.com/organizations/oauth2/v2.0/token",
		scopes: "Mail.ReadWrite Mail.Send Calendars.ReadWrite offline_access User.Read",
		graphBaseUrl: "https://graph.microsoft.com/v1.0",
	},
};

export interface ResolvedProvider extends ProviderConfig {
	type: string;
	clientId: string;
	clientSecret: string;
}

/**
 * Map of provider type → env var names for credentials.
 */
const PROVIDER_ENV_KEYS: Record<string, { clientId: string; clientSecret: string }> = {
	microsoft_365: {
		clientId: "OAUTH_MICROSOFT_CLIENT_ID",
		clientSecret: "OAUTH_MICROSOFT_CLIENT_SECRET",
	},
};

/**
 * Get a provider config with credentials resolved from env vars.
 * Returns null if the provider type is unknown or credentials are not configured.
 */
export function getProvider(type: string): ResolvedProvider | null {
	const config = PROVIDERS[type];
	if (!config) return null;

	const envKeys = PROVIDER_ENV_KEYS[type];
	if (!envKeys) return null;

	const clientId = env[envKeys.clientId];
	const clientSecret = env[envKeys.clientSecret];
	if (!clientId || !clientSecret) return null;

	return { ...config, type, clientId, clientSecret };
}

/**
 * List all providers that have credentials configured.
 */
export function getEnabledProviders(): ResolvedProvider[] {
	return Object.keys(PROVIDERS)
		.map((type) => getProvider(type))
		.filter((p): p is ResolvedProvider => p !== null);
}

/**
 * Get the static config for a provider type (without credentials).
 */
export function getProviderConfig(type: string): ProviderConfig | null {
	return PROVIDERS[type] ?? null;
}
