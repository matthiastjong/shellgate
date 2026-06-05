import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

interface McpSession {
	transport: WebStandardStreamableHTTPServerTransport;
	server: McpServer;
	bootstrapped: boolean;
	createdAt: number;
}

const sessions = new Map<string, McpSession>();

const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

export function getSession(sessionId: string): McpSession | undefined {
	return sessions.get(sessionId);
}

export function addSession(sessionId: string, transport: WebStandardStreamableHTTPServerTransport, server: McpServer): McpSession {
	const session: McpSession = { transport, server, bootstrapped: false, createdAt: Date.now() };
	sessions.set(sessionId, session);
	return session;
}

export function markBootstrapped(sessionId: string): void {
	const session = sessions.get(sessionId);
	if (session) session.bootstrapped = true;
}

export function isBootstrapped(sessionId: string): boolean {
	return sessions.get(sessionId)?.bootstrapped ?? false;
}

export function removeSession(sessionId: string): void {
	sessions.delete(sessionId);
}

export function cleanupStaleSessions(): void {
	const now = Date.now();
	for (const [id, session] of sessions) {
		if (now - session.createdAt > SESSION_TTL_MS) {
			sessions.delete(id);
		}
	}
}
