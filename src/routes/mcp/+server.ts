import type { RequestHandler } from "@sveltejs/kit";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { requireBearer } from "$lib/server/api-auth";
import { createMcpServer, registerTools } from "$lib/server/mcp/server";
import { getSession, addSession, removeSession, cleanupStaleSessions } from "$lib/server/mcp/sessions";

export const POST: RequestHandler = async ({ request }) => {
	const token = await requireBearer(request);

	const sessionId = request.headers.get("mcp-session-id");

	// Existing session — reuse transport
	if (sessionId) {
		const session = getSession(sessionId);
		if (!session) {
			return new Response(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message: "Session not found" } }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			});
		}
		return session.transport.handleRequest(request);
	}

	// New session — create server + transport
	cleanupStaleSessions();

	const server = createMcpServer();
	registerTools(server, token);

	const transport = new WebStandardStreamableHTTPServerTransport({
		sessionIdGenerator: () => crypto.randomUUID(),
		onsessioninitialized: (id) => {
			addSession(id, transport, server);
		},
	});

	transport.onclose = () => {
		if (transport.sessionId) {
			removeSession(transport.sessionId);
		}
	};

	await server.connect(transport);

	return transport.handleRequest(request);
};

export const GET: RequestHandler = async () => {
	return new Response("Shellgate MCP server. Use POST with MCP protocol.", {
		status: 405,
		headers: { Allow: "POST" },
	});
};

export const DELETE: RequestHandler = async ({ request }) => {
	const sessionId = request.headers.get("mcp-session-id");
	if (sessionId) {
		const session = getSession(sessionId);
		if (session) {
			await session.transport.handleRequest(request);
			removeSession(sessionId);
			return new Response(null, { status: 200 });
		}
	}
	return new Response(null, { status: 405, headers: { Allow: "POST" } });
};
