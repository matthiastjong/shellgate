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
				$lib: "/src/lib",
			},
		},
	};
});
