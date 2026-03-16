import path from "node:path";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), "");
	return {
		test: {
			include: ["tests/**/*.test.ts"],
			env,
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
