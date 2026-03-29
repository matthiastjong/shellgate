import path from "node:path";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), "");
	// Remove DATABASE_URL from env so it doesn't override the Testcontainers URL
	const { DATABASE_URL: _, ...testEnv } = env;
	return {
		test: {
			include: ["tests/**/*.test.ts"],
			env: testEnv,
			globalSetup: ["tests/setup.ts"],
			setupFiles: ["tests/setup-env.ts"],
			testTimeout: 30000,
			hookTimeout: 60000,
			fileParallelism: false,
		},
		resolve: {
			alias: {
				$lib: path.resolve("src/lib"),
				"$env/dynamic/private": path.resolve("tests/mocks/env-dynamic-private.ts"),
				"$app/environment": path.resolve("tests/mocks/app-environment.ts"),
			},
		},
	};
});
