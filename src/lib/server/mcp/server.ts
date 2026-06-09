import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { Token } from "$lib/server/db/schema";
import { bootstrap } from "./tools/bootstrap";
import { apiRequest } from "./tools/api-request";
import type { ApiRequestArgs } from "./tools/api-request";
import { apiDownload, readDownloadedImageResource } from "./tools/api-download";
import type { ApiDownloadArgs } from "./tools/api-download";
import { sshExec } from "./tools/ssh-exec";
import type { SshExecArgs } from "./tools/ssh-exec";
import { webhookPoll, webhookAck } from "./tools/webhooks";
import { skillList, skillRead, skillUpsert, skillDelete } from "./tools/skills";
import { memoryList, memoryRead, memoryAdd, memoryDelete } from "./tools/memories";
import { wikiListPages, wikiReadPage, wikiUpsertPage, wikiDeletePage, wikiLintPage } from "./tools/wiki";
import { vaultSearch } from "./tools/vaults";
import { mailSearch, mailRead, mailAttachment, mailSend, mailDraft, mailFolders, mailMove, mailFlag } from "./tools/mail";

const INSTRUCTIONS = `Shellgate is your shared organization context layer. It complements — does not replace — your native memory, skill, and knowledge systems. Always read and write Shellgate for durable organizational information.

At session start, call \`bootstrap\` (or use the context injected by your SessionStart hook) to load targets, skills, memories, wiki pages, and webhooks.

Memory:
- Before relying on persistent knowledge, check Shellgate memory via memory_list.
- When you learn durable information (preferences, decisions, context), write it to Shellgate via memory_add in addition to any native memory.
- Scan memory summaries from bootstrap and call memory_read for relevant entries.

Skills:
- Before performing organization-specific procedures, check org_skill_list.
- Load full skill instructions via org_skill_read when needed.
- Share reusable procedures via org_skill_upsert.
- Organization skills are different from local/native skills. Use org_skill_* MCP tools, not native skill systems.

Wiki:
- Consult wiki pages for project conventions and organizational knowledge.
- When creating or updating durable documentation, write to Shellgate wiki.
- Before creating/updating wiki pages, read the relevant wiki skill (wiki-create-page, wiki-update-page, or wiki-compile-research) via org_skill_read.

If native context and Shellgate disagree, treat Shellgate as the shared organizational record and surface the conflict to the user.

When Linear issue descriptions contain \`https://uploads.linear.app/...\` image URLs, use the \`linear-uploads\` target with \`api_download\` to fetch them. Do not expose image bytes as text.

Call vault_search when you need credentials for browser automation — it returns handles for blind-fill, not secret values.`;

export function createMcpServer() {
	const server = new McpServer(
		{ name: "shellgate", version: "1.0.0" },
		{ instructions: INSTRUCTIONS }
	);
	server.registerResource(
		"downloaded_image",
		new ResourceTemplate("shellgate-download://{id}", { list: undefined }),
		{
			title: "Downloaded Image",
			description: "Temporary binary image downloaded through Shellgate api_download",
		},
		(uri) => readDownloadedImageResource(uri.toString())
	);
	return server;
}

function asToolResult(result: unknown) {
	if (result && typeof result === "object" && "content" in result) {
		return result as CallToolResult;
	}
	return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
}

export function registerTools(server: McpServer, token: Token) {
	server.tool(
		"bootstrap",
		"Returns all targets, skills, webhooks, memories, wiki pages, and vaults. Call at session start if not already provided by a SessionStart hook.",
		async () => {
			const result = await bootstrap(token);
			return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
		}
	);

	server.tool("discover", "Alias for bootstrap — returns targets, skills, webhooks, memories, wiki pages, and vaults.", async () => {
		const result = await bootstrap(token);
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
			approved: z.preprocess(val => val === "true" || val === true, z.boolean()).optional().describe("Set to true after user approves a guarded request"),
		},
		async (args) => {
			const result = await apiRequest(token, args);
			return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
		}
	);

	server.tool(
		"api_download",
		"Download an image response from an API target through Shellgate and return a temporary MCP resource link. Use for authenticated binary images such as Linear uploads. Only image/png, image/jpeg, and image/webp are accepted; image bytes/base64 are not returned as text.",
		{
			target: z.string().describe("Target slug"),
			path: z.string().describe("Path appended to target's baseUrl"),
			maxBytes: z.number().optional().describe("Maximum response size in bytes, capped at 20 MB"),
			approved: z.preprocess(val => val === "true" || val === true, z.boolean()).optional().describe("Set to true after user approves a guarded request"),
		},
		async (args) => {
			const result = await apiDownload(token, args);
			return asToolResult(result);
		}
	);

	server.tool(
		"ssh_exec",
		"Execute a command on an SSH target. If the response has status 'approval_required', present the reason to the user and re-call with approved: true after they confirm.",
		{
			target: z.string().describe("Target slug"),
			command: z.string().describe("Shell command to execute"),
			timeout: z.number().optional().describe("Timeout in seconds (default 30, max 60)"),
			approved: z.preprocess(val => val === "true" || val === true, z.boolean()).optional().describe("Set to true after user approves a guarded request"),
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

	server.tool(
		"wiki_list_pages",
		"Browse the wiki index. Returns slug, title, namespace, tags, summary, status, version, updatedAt, updatedBy for each page. No body — use wiki_read_page for full content.",
		{
			namespace: z.string().optional().describe("Filter by namespace (default: all)"),
			status: z.string().optional().describe("Filter by status: 'active' (default), 'draft', 'archived', or 'all'"),
			tag: z.string().optional().describe("Filter by tag"),
		},
		async (args) => {
			const result = await wikiListPages(args);
			return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
		}
	);

	server.tool(
		"wiki_read_page",
		"Read a wiki page's full content including body, sources, and version. Use for background knowledge before starting a task.",
		{
			namespace: z.string().optional().describe("Namespace (default: 'general')"),
			slug: z.string().describe("Page slug"),
		},
		async (args) => {
			const result = await wikiReadPage(args);
			return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
		}
	);

	server.tool(
		"wiki_upsert_page",
		"Create or update a wiki page. For updates, pass expectedVersion for optimistic concurrency. Write-back pattern: read → modify → upsert with expectedVersion.",
		{
			namespace: z.string().optional().describe("Namespace (default: 'general')"),
			slug: z.string().describe("Page slug (lowercase alphanumeric + hyphens)"),
			title: z.string().describe("Page title"),
			body: z.string().describe("Full markdown content"),
			summary: z.string().optional().describe("One-line summary (max 500 chars)"),
			tags: z.array(z.string()).optional().describe("Tags for categorization"),
			sources: z.array(z.object({
				type: z.enum(["url", "file", "mcp", "manual", "semrush"]).describe("Source type"),
				title: z.string().optional().describe("Source title"),
				uri: z.string().optional().describe("Source URI (required for url, mcp, semrush)"),
				retrievedAt: z.string().optional().describe("ISO timestamp when source was fetched"),
			})).optional().describe("Source references"),
			status: z.enum(["draft", "active", "archived"]).optional().describe("Page status (default: 'active')"),
			expectedVersion: z.number().optional().describe("Expected current version for optimistic concurrency"),
		},
		async (args) => {
			const result = await wikiUpsertPage(token, args);
			return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
		}
	);

	server.tool(
		"wiki_delete_page",
		"Archive a wiki page (soft delete). Sets status to 'archived'.",
		{
			namespace: z.string().optional().describe("Namespace (default: 'general')"),
			slug: z.string().describe("Page slug"),
		},
		async (args) => {
			const result = await wikiDeletePage(args);
			return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
		}
	);

	server.tool(
		"wiki_lint_page",
		"Validate a wiki page's structure. Can lint an existing page (by slug) or raw content (title+body). Checks title, body length, sources, boundary violations (memory/skill content), and broken [[wiki-links]].",
		{
			namespace: z.string().optional().describe("Namespace for existing page lookup"),
			slug: z.string().optional().describe("Slug of existing page to lint"),
			title: z.string().optional().describe("Title for direct content lint"),
			body: z.string().optional().describe("Body for direct content lint"),
			sources: z.array(z.object({
				type: z.enum(["url", "file", "mcp", "manual", "semrush"]),
				title: z.string().optional(),
				uri: z.string().optional(),
				retrievedAt: z.string().optional(),
			})).optional().describe("Sources for direct content lint"),
		},
		async (args) => {
			const result = await wikiLintPage(args);
			return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
		}
	);

	server.tool(
		"vault_search",
		"Search for credential items in vaults accessible to this token. Returns item handles with non-sensitive field values (e.g. username). Sensitive values (e.g. password) are only available via the local blind-fill MCP tool.",
		{
			query: z.string().describe("Search query — matches against item name, domain, and description"),
		},
		async (args) => {
			const result = await vaultSearch(token, args);
			return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
		}
	);

	server.tool(
		"mail_search",
		"Search emails in a mailbox. Returns message list with uid, from, to, subject, date, flags.",
		{
			target: z.string().describe("Email target slug"),
			folder: z.string().optional().describe("Folder (default: INBOX)"),
			query: z.record(z.string(), z.string()).optional().describe("Search criteria: from, to, subject, since, before, text"),
			limit: z.number().optional().describe("Max results (default: 20)"),
		},
		async (args) => {
			const result = await mailSearch(token, args);
			return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
		}
	);

	server.tool(
		"mail_read",
		"Read a full email message by UID. Returns from, to, cc, subject, date, text, html, flags, and attachment metadata.",
		{
			target: z.string().describe("Email target slug"),
			uid: z.number().describe("Message UID"),
			folder: z.string().optional().describe("Folder (default: INBOX)"),
		},
		async (args) => {
			const result = await mailRead(token, args);
			return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
		}
	);

	server.tool(
		"mail_attachment",
		"Download an email attachment by UID and part ID. Returns base64-encoded content.",
		{
			target: z.string().describe("Email target slug"),
			uid: z.number().describe("Message UID"),
			partId: z.number().describe("Attachment part ID (1-based)"),
			folder: z.string().optional().describe("Folder (default: INBOX)"),
		},
		async (args) => {
			const result = await mailAttachment(token, args);
			return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
		}
	);

	server.tool(
		"mail_send",
		"Send an email. Requires approval — first call returns approval_required, re-call with approved: true after user confirms.",
		{
			target: z.string().describe("Email target slug"),
			to: z.union([z.string(), z.array(z.string())]).describe("Recipient(s)"),
			cc: z.union([z.string(), z.array(z.string())]).optional().describe("CC recipient(s)"),
			bcc: z.union([z.string(), z.array(z.string())]).optional().describe("BCC recipient(s)"),
			subject: z.string().describe("Email subject"),
			text: z.string().optional().describe("Plain text body"),
			html: z.string().optional().describe("HTML body"),
			inReplyTo: z.string().optional().describe("Message-ID of the email being replied to"),
			approved: z.preprocess(val => val === "true" || val === true, z.boolean()).optional().describe("Set to true after user explicitly approves sending"),
		},
		async (args) => {
			const result = await mailSend(token, args);
			return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
		}
	);

	server.tool(
		"mail_draft",
		"Create a draft email in the Drafts folder.",
		{
			target: z.string().describe("Email target slug"),
			to: z.union([z.string(), z.array(z.string())]).optional().describe("Recipient(s)"),
			subject: z.string().optional().describe("Email subject"),
			text: z.string().optional().describe("Plain text body"),
			html: z.string().optional().describe("HTML body"),
		},
		async (args) => {
			const result = await mailDraft(token, args);
			return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
		}
	);

	server.tool(
		"mail_folders",
		"List all folders/labels in the mailbox.",
		{
			target: z.string().describe("Email target slug"),
		},
		async (args) => {
			const result = await mailFolders(token, args);
			return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
		}
	);

	server.tool(
		"mail_move",
		"Move an email to a different folder.",
		{
			target: z.string().describe("Email target slug"),
			uid: z.number().describe("Message UID"),
			from: z.string().describe("Source folder"),
			to: z.string().describe("Destination folder"),
		},
		async (args) => {
			const result = await mailMove(token, args);
			return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
		}
	);

	server.tool(
		"mail_flag",
		"Set or unset flags on an email (e.g. \\\\Seen, \\\\Flagged).",
		{
			target: z.string().describe("Email target slug"),
			uid: z.number().describe("Message UID"),
			folder: z.string().optional().describe("Folder (default: INBOX)"),
			add: z.array(z.string()).optional().describe("Flags to add (e.g. [\"\\\\Seen\", \"\\\\Flagged\"])"),
			remove: z.array(z.string()).optional().describe("Flags to remove"),
		},
		async (args) => {
			const result = await mailFlag(token, args);
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
			case "bootstrap":
				return bootstrap(t);
			case "discover":
				return bootstrap(t);
			case "api_request":
				return apiRequest(t, args as unknown as ApiRequestArgs);
			case "api_download":
				return apiDownload(t, args as unknown as ApiDownloadArgs);
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
			case "wiki_list_pages":
				return wikiListPages(args as unknown as { namespace?: string; status?: string; tag?: string });
			case "wiki_read_page":
				return wikiReadPage(args as unknown as { namespace?: string; slug: string });
			case "wiki_upsert_page":
				return wikiUpsertPage(t, args as unknown as { namespace?: string; slug: string; title: string; body: string; summary?: string; tags?: string[]; sources?: Array<{ type: string; title?: string; uri?: string; retrievedAt?: string }>; status?: string; expectedVersion?: number });
			case "wiki_delete_page":
				return wikiDeletePage(args as unknown as { namespace?: string; slug: string });
			case "wiki_lint_page":
				return wikiLintPage(args as unknown as { namespace?: string; slug?: string; title?: string; body?: string; sources?: Array<{ type: string; title?: string; uri?: string; retrievedAt?: string }> });
			case "vault_search":
				return vaultSearch(t, args as unknown as { query: string });
			case "mail_search":
				return mailSearch(t, args as unknown as { target: string; folder?: string; query?: Record<string, string>; limit?: number });
			case "mail_read":
				return mailRead(t, args as unknown as { target: string; uid: number; folder?: string });
			case "mail_attachment":
				return mailAttachment(t, args as unknown as { target: string; uid: number; partId: number; folder?: string });
			case "mail_send":
				return mailSend(t, args as unknown as { target: string; to: string | string[]; cc?: string | string[]; bcc?: string | string[]; subject: string; text?: string; html?: string; inReplyTo?: string; approved?: boolean });
			case "mail_draft":
				return mailDraft(t, args as unknown as { target: string; to?: string | string[]; subject?: string; text?: string; html?: string });
			case "mail_folders":
				return mailFolders(t, args as unknown as { target: string });
			case "mail_move":
				return mailMove(t, args as unknown as { target: string; uid: number; from: string; to: string });
			case "mail_flag":
				return mailFlag(t, args as unknown as { target: string; uid: number; folder?: string; add?: string[]; remove?: string[] });
			default:
				throw new Error(`Unknown tool: ${name}`);
		}
	};
}
