import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { execSync } from "node:child_process";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";

let container: StartedPostgreSqlContainer;

export async function setup() {
	container = await new PostgreSqlContainer("postgres:16").start();

	const connectionUri = container.getConnectionUri();
	process.env.DATABASE_URL = connectionUri;

	// Push schema to the test database
	execSync(`npx drizzle-kit push --force`, {
		env: { ...process.env, DATABASE_URL: connectionUri },
		stdio: "pipe",
	});
}

export async function teardown() {
	await container?.stop();
}
