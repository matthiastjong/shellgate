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
import { memoryList, memoryRead, memoryAdd, memoryDelete } from "./tools/memories";

const INSTRUCTIONS = `Always call discover at the start of each session to learn available targets, webhooks, and organization skills. Then call org_skill_list to see available organization skills and memory_list to load the memory index. Scan memory summaries and call memory_read for any memories relevant to the current task. Only call org_skill_read when you need a specific skill's full instructions.

Shellgate manages organization-wide skills shared across all agents — these are different from local Claude Code skills. Use org_skill_* tools for shared organization skills, and the superpowers writing-skills skill for local Claude Code skills.`;

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

	server.tool("org_skill_list", "List all organization-wide skills shared across Shellgate agents (slug and description)", async () => {
		const result = await skillList();
		return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
	});

	server.tool(
		"org_skill_read",
		"Read the full content of a shared organization skill from Shellgate",
		{ slug: z.string().describe("Skill slug") },
		async (args) => {
			const result = await skillRead(args);
			return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
		}
	);

	server.tool(
		"org_skill_upsert",
		"Create or update a shared organization skill in Shellgate. Content must be full markdown with YAML frontmatter (name, description). These skills are shared across all agents.",
		{ content: z.string().describe("Full skill markdown with YAML frontmatter") },
		async (args) => {
			const result = await skillUpsert(args);
			return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
		}
	);

	server.tool(
		"org_skill_delete",
		"Delete a shared organization skill from Shellgate",
		{ slug: z.string().describe("Skill slug") },
		async (args) => {
			const result = await skillDelete(args);
			return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
		}
	);

	server.tool(
		"memory_list",
		`Returns a compact index of all accessible memories (id, summary, visibility, user, updatedAt). Call at session start and before memory_add to check for duplicates or memories to update. Max 100 results.

You see: all org memories, user memories matching your user, and your own token memories.`,
		{
			visibility: z.enum(["org", "user", "token"]).optional().describe("Filter by visibility level"),
			user: z.string().optional().describe("Filter by user identifier"),
		},
		async (args) => {
			const result = await memoryList(token, args);
			return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
		}
	);

	server.tool(
		"memory_read",
		"Returns the full content of a specific memory. Only fetch memories relevant to your current task — don't read everything.",
		{
			id: z.string().describe("Memory ID"),
		},
		async (args) => {
			const result = await memoryRead(token, args);
			return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
		}
	);

	server.tool(
		"memory_add",
		`Store a fact, preference, or learning. Rules:
- summary: one-line description (max 500 chars) — this is the index entry
- content: full detail — be concise but complete
- Always call memory_list first to check for existing similar memories
- If updating a fact, memory_delete the old one then memory_add the new
- One fact per memory — don't bundle unrelated things
- Write memories when you learn something useful for future sessions

Visibility guide:
- org: Facts useful to ALL team members and agents. Examples: project names & repo URLs, infra details, team conventions.
- user: Personal preferences and context for ONE person. Examples: coding style, communication preferences, role/responsibilities.
- token: Context specific to THIS agent instance only. Examples: session conclusions, task-specific learnings.

When in doubt, prefer 'user' over 'org' — easier to promote later than to clean up noise.`,
		{
			summary: z.string().describe("One-line description (max 500 chars) — the index entry"),
			content: z.string().describe("Full detail of the memory"),
			visibility: z.enum(["org", "user", "token"]).describe("Visibility level"),
			user: z.string().optional().describe("User identifier (resolved from token defaultUser if not provided)"),
			metadata: z.record(z.string(), z.unknown()).optional().describe("Arbitrary key-value metadata"),
		},
		async (args) => {
			const result = await memoryAdd(token, args);
			return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
		}
	);

	server.tool(
		"memory_delete",
		"Delete a memory that is outdated, incorrect, or superseded. Prefer updating (delete + add) over keeping stale memories. You can only delete memories created by your token.",
		{
			id: z.string().describe("Memory ID to delete"),
		},
		async (args) => {
			const result = await memoryDelete(token, args);
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
			case "org_skill_list":
				return skillList();
			case "org_skill_read":
				return skillRead(args as unknown as { slug: string });
			case "org_skill_upsert":
				return skillUpsert(args as unknown as { content: string });
			case "org_skill_delete":
				return skillDelete(args as unknown as { slug: string });
			case "memory_list":
				return memoryList(t, args as unknown as { visibility?: string; user?: string });
			case "memory_read":
				return memoryRead(t, args as unknown as { id: string });
			case "memory_add":
				return memoryAdd(t, args as unknown as { summary: string; content: string; visibility: string; user?: string; metadata?: Record<string, unknown> });
			case "memory_delete":
				return memoryDelete(t, args as unknown as { id: string });
			default:
				throw new Error(`Unknown tool: ${name}`);
		}
	};
}
