import type { Token } from "$lib/server/db/schema";
import { discover } from "./tools/discover";
import { apiRequest } from "./tools/api-request";
import type { ApiRequestArgs } from "./tools/api-request";
import { sshExec } from "./tools/ssh-exec";
import type { SshExecArgs } from "./tools/ssh-exec";

type ToolHandler = (name: string, args: Record<string, unknown>) => Promise<unknown>;

export function createMcpToolHandler(token: Token): ToolHandler {
	return async (name: string, args: Record<string, unknown>) => {
		switch (name) {
			case "discover":
				return discover(token);
			case "api_request":
				return apiRequest(token, args as unknown as ApiRequestArgs);
			case "ssh_exec":
				return sshExec(token, args as unknown as SshExecArgs);
			default:
				throw new Error(`Unknown tool: ${name}`);
		}
	};
}
