export const env: Record<string, string> = {
	DATABASE_URL: process.env.DATABASE_URL ?? "",
	SESSION_SECRET: process.env.SESSION_SECRET ?? "test-secret-for-vitest",
	OAUTH_MICROSOFT_CLIENT_ID: "test-client-id",
	OAUTH_MICROSOFT_CLIENT_SECRET: "test-client-secret",
};
