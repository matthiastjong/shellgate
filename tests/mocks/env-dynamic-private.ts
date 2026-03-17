export const env = {
	DATABASE_URL: process.env.DATABASE_URL ?? "",
	SESSION_SECRET: process.env.SESSION_SECRET ?? "test-secret-for-vitest",
};
