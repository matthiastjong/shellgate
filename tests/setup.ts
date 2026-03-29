import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { execSync } from "node:child_process";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import type { TestProject } from "vitest/node";

declare module "vitest" {
	export interface ProvidedContext {
		databaseUrl: string;
	}
}

let container: StartedPostgreSqlContainer;

export async function setup(project: TestProject) {
	container = await new PostgreSqlContainer("postgres:16").start();

	const connectionUri = container.getConnectionUri();
	process.env.DATABASE_URL = connectionUri;

	// Push schema to the test database
	execSync(`npx drizzle-kit push --force`, {
		env: { ...process.env, DATABASE_URL: connectionUri },
		stdio: "pipe",
	});

	project.provide("databaseUrl", connectionUri);
}

export async function teardown() {
	await container?.stop();
}
