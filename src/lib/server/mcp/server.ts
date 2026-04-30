import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Token } from "$lib/server/db/schema";
import { discover } from "./tools/discover";
import { apiRequest } from "./tools/api-request";
import type { ApiRequestArgs } from "./tools/api-request";
import { sshExec } from "./tools/ssh-exec";
import type { SshExecArgs } from "./tools/ssh-exec";
import { webhookPoll, webhookAck } from "./tools/webhooks";
import { skillList, skillRead, skillUpsert, skillDelete } from "./tools/skills";

const INSTRUCTIONS = `Always call discover at the start of each session to learn available targets, webhooks, and skills. Then call skill_list to see available skills. Only call skill_read when you need a specific skill's full instructions.`;

export function createMcpServer() {
	const server = new McpServer(
		{ name: "shellgate", version: "1.0.0" },
		{ instructions: INSTRUCTIONS }
	);
	return server;
}

export function registerTools(server: McpServer, token: Token) {
	server.tool("discover", "List all targets, webhook endpoints, and skills accessible to this token", async () => {
		const result = await discover(token);
		return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
	});

	server.tool(
		"api_request",
		"Proxy an HTTP request through the gateway to an upstream API target. If the response has status 'approval_required', present the reason to the user and re-call with approved: true after they confirm.",
		{
			target: z.string().describe("Target slug"),
			method: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"]).describe("HTTP method"),
			path: z.string().describe("Path appended to target's baseUrl"),
			headers: z.record(z.string(), z.string()).optional().describe("Additional request headers"),
			body: z.union([z.string(), z.record(z.string(), z.unknown())]).optional().describe("Request body"),
			approved: z.boolean().optional().describe("Set to true after user approves a guarded request"),
		},
		async (args) => {
			const result = await apiRequest(token, args);
			return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
		}
	);

	server.tool(
		"ssh_exec",
		"Execute a command on an SSH target. If the response has status 'approval_required', present the reason to the user and re-call with approved: true after they confirm.",
		{
			target: z.string().describe("Target slug"),
			command: z.string().describe("Shell command to execute"),
			timeout: z.number().optional().describe("Timeout in seconds (default 30, max 60)"),
			approved: z.boolean().optional().describe("Set to true after user approves a guarded request"),
		},
		async (args) => {
			const result = await sshExec(token, args);
			return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
		}
	);

	server.tool("webhook_poll", "Poll for pending webhook events", async () => {
		const result = await webhookPoll(token);
		return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
	});

	server.tool(
		"webhook_ack",
		"Acknowledge processed webhook events",
		{ eventIds: z.array(z.string()).describe("Event IDs to acknowledge") },
		async (args) => {
			const result = await webhookAck(token, args);
			return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
		}
	);

	server.tool("skill_list", "List all organization skills with slug and description", async () => {
		const result = await skillList();
		return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
	});

	server.tool(
		"skill_read",
		"Read the full content of a skill",
		{ slug: z.string().describe("Skill slug") },
		async (args) => {
			const result = await skillRead(args);
			return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
		}
	);

	server.tool(
		"skill_upsert",
		"Create or update a skill. Content must be full markdown with YAML frontmatter (name, description)",
		{ content: z.string().describe("Full skill markdown with YAML frontmatter") },
		async (args) => {
			const result = await skillUpsert(args);
			return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
		}
	);

	server.tool(
		"skill_delete",
		"Delete a skill",
		{ slug: z.string().describe("Skill slug") },
		async (args) => {
			const result = await skillDelete(args);
			return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
		}
	);
}

type ToolHandler = (name: string, args: Record<string, unknown>) => Promise<unknown>;
type TokenLike = Pick<Token, "id" | "name">;

export function createMcpToolHandler(token: TokenLike): ToolHandler {
	const t = token as Token;
	return async (name: string, args: Record<string, unknown>) => {
		switch (name) {
			case "discover":
				return discover(t);
			case "api_request":
				return apiRequest(t, args as unknown as ApiRequestArgs);
			case "ssh_exec":
				return sshExec(t, args as unknown as SshExecArgs);
			case "webhook_poll":
				return webhookPoll(t);
			case "webhook_ack":
				return webhookAck(t, args as unknown as { eventIds: string[] });
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
