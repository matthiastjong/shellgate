import type { Token } from "$lib/server/db/schema";
import { discover } from "./tools/discover";
import { apiRequest } from "./tools/api-request";
import type { ApiRequestArgs } from "./tools/api-request";
import { sshExec } from "./tools/ssh-exec";
import type { SshExecArgs } from "./tools/ssh-exec";
import { webhookPoll, webhookAck } from "./tools/webhooks";
import { skillList, skillRead, skillUpsert, skillDelete } from "./tools/skills";

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
			case "webhook_poll":
				return webhookPoll(token);
			case "webhook_ack":
				return webhookAck(token, args as unknown as { eventIds: string[] });
			case "skill_list":
				return skillList();
			case "skill_read":
				return skillRead(args as unknown as { slug: string });
			case "skill_upsert":
				return skillUpsert(args as unknown as { content: string });
			case "skill_delete":
				return skillDelete(args as unknown as { slug: string });
			default:
				throw new Error(`Unknown tool: ${name}`);
		}
	};
}
