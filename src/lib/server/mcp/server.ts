import type { Token } from "$lib/server/db/schema";
import { discover } from "./tools/discover";

type ToolHandler = (name: string, args: Record<string, unknown>) => Promise<unknown>;

export function createMcpToolHandler(token: Token): ToolHandler {
	return async (name: string, args: Record<string, unknown>) => {
		switch (name) {
			case "discover":
				return discover(token);
			default:
				throw new Error(`Unknown tool: ${name}`);
		}
	};
}
