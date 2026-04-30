import type { RequestHandler } from "@sveltejs/kit";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { requireBearer } from "$lib/server/api-auth";
import { createMcpServer, registerTools } from "$lib/server/mcp/server";

export const POST: RequestHandler = async ({ request }) => {
	const token = await requireBearer(request);

	const server = createMcpServer();
	registerTools(server, token);

	const transport = new WebStandardStreamableHTTPServerTransport({
		sessionIdGenerator: undefined,
	});

	await server.connect(transport);

	return transport.handleRequest(request);
};

export const GET: RequestHandler = async () => {
	return new Response("Shellgate MCP server. Use POST with MCP protocol.", {
		status: 405,
		headers: { Allow: "POST" },
	});
};

export const DELETE: RequestHandler = async () => {
	return new Response(null, { status: 405, headers: { Allow: "POST" } });
};
