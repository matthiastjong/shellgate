import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { RequestHandler } from "./$types";

let cachedScript: string | null = null;

function getScript(): string {
	if (cachedScript) return cachedScript;

	const attempts = [
		join(process.cwd(), "local-mcp", "blind-fill.mjs"),
		join(process.cwd(), "src", "local-mcp", "blind-fill.mjs"),
	];

	for (const path of attempts) {
		try {
			cachedScript = readFileSync(path, "utf-8");
			return cachedScript;
		} catch {
			continue;
		}
	}

	throw new Error("blind-fill.mjs not found");
}

export const GET: RequestHandler = async () => {
	const script = getScript();
	return new Response(script, {
		headers: {
			"Content-Type": "application/javascript",
			"Cache-Control": "public, max-age=3600",
		},
	});
};
