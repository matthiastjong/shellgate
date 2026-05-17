// Bundle blind-fill.src.mjs into a self-contained blind-fill.bundle.mjs
import { build } from "esbuild";

await build({
	entryPoints: ["src/local-mcp/blind-fill.src.mjs"],
	outfile: "src/local-mcp/blind-fill.bundle.mjs",
	bundle: true,
	format: "esm",
	platform: "node",
	target: "node20",
	banner: {
		js: "// Auto-generated — do not edit. Source: blind-fill.src.mjs",
	},
});

console.log("Built src/local-mcp/blind-fill.bundle.mjs");
