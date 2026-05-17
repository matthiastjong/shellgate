#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import WebSocket from "ws";

const SHELLGATE_URL = process.env.SHELLGATE_URL?.replace(/\/+$/, "");
const SHELLGATE_TOKEN = process.env.SHELLGATE_TOKEN;
const CDP_URL = process.env.CDP_URL || "http://localhost:9222";

if (!SHELLGATE_URL || !SHELLGATE_TOKEN) {
	process.stderr.write("SHELLGATE_URL and SHELLGATE_TOKEN are required\n");
	process.exit(1);
}

// --- CDP helpers ---

interface CdpTarget {
	type: string;
	webSocketDebuggerUrl: string;
}

interface CdpResult {
	result: { value: unknown };
}

async function getActivePage(): Promise<CdpTarget> {
	const res = await fetch(`${CDP_URL}/json`, { signal: AbortSignal.timeout(5000) });
	if (!res.ok) throw new Error("cdp_connection_failed");
	const targets: CdpTarget[] = await res.json();
	const page = targets.find((t) => t.type === "page");
	if (!page) throw new Error("no_active_page");
	return page;
}

let cdpIdCounter = 1;

function cdpCall(ws: WebSocket, method: string, params: Record<string, unknown> = {}): Promise<CdpResult> {
	return new Promise((resolve, reject) => {
		const id = cdpIdCounter++;
		const handler = (data: WebSocket.RawData) => {
			const msg = JSON.parse(data.toString());
			if (msg.id === id) {
				ws.removeListener("message", handler);
				if (msg.error) reject(new Error(msg.error.message));
				else resolve(msg.result);
			}
		};
		ws.on("message", handler);
		ws.send(JSON.stringify({ id, method, params }));
	});
}

async function connectCdp(): Promise<WebSocket> {
	const page = await getActivePage();
	const ws = new WebSocket(page.webSocketDebuggerUrl);
	await new Promise<void>((resolve, reject) => {
		const timeout = setTimeout(() => { ws.close(); reject(new Error("cdp_connection_timeout")); }, 5000);
		ws.once("open", () => { clearTimeout(timeout); resolve(); });
		ws.once("error", (err) => { clearTimeout(timeout); reject(err); });
	});
	return ws;
}

async function getBrowserOrigin(ws: WebSocket): Promise<string> {
	const result = await cdpCall(ws, "Runtime.evaluate", {
		expression: "window.location.origin",
		returnByValue: true,
	});
	return (result as unknown as CdpResult).result.value as string;
}

// --- Shellgate API ---

interface OriginMismatchError extends Error {
	allowedOrigins?: string[];
	actualOrigin?: string;
}

async function fetchSecret(handle: string, field: string, origin: string): Promise<string> {
	const [vaultSlug, itemSlug] = handle.split("/");
	if (!vaultSlug || !itemSlug) throw new Error("invalid handle format, expected vault-slug/item-slug");

	const url = `${SHELLGATE_URL}/api/vault-items/${encodeURIComponent(vaultSlug)}/${encodeURIComponent(itemSlug)}/fields/${encodeURIComponent(field)}/value?origin=${encodeURIComponent(origin)}`;
	const res = await fetch(url, {
		headers: { Authorization: `Bearer ${SHELLGATE_TOKEN}` },
	});

	if (res.status === 403) {
		const body = await res.json().catch(() => ({}));
		if (body.message) {
			try {
				const parsed = JSON.parse(body.message);
				if (parsed.error === "origin_mismatch") {
					throw Object.assign(new Error("origin_mismatch"), parsed);
				}
			} catch (e) {
				if ((e as Error).message === "origin_mismatch") throw e;
			}
		}
		throw new Error("auth_failed");
	}
	if (res.status === 404) throw new Error("not_found");
	if (!res.ok) throw new Error(`shellgate_error_${res.status}`);

	const data = await res.json();
	return data.value;
}

// --- Tool result helpers ---

function success(data: Record<string, unknown>) {
	return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
}

function error(data: Record<string, unknown>) {
	return { content: [{ type: "text" as const, text: JSON.stringify(data) }], isError: true };
}

// --- MCP Server ---

const server = new McpServer(
	{ name: "shellgate-secrets", version: "1.0.0" },
	{ capabilities: { tools: {} } },
);

server.tool(
	"blind_fill",
	"Fill a sensitive vault field into a browser element via CSS selector. The secret never appears in the agent context.",
	{
		handle: z.string().describe("Vault item handle (vault-slug/item-slug)"),
		field: z.string().describe("Field name (e.g. password)"),
		selector: z.string().describe("CSS selector for the target DOM element"),
	},
	async ({ handle, field, selector }) => {
		const ws = await connectCdp();
		try {
			const origin = await getBrowserOrigin(ws);
			let value: string | null = await fetchSecret(handle, field, origin);

			const escapedValue = JSON.stringify(value);
			const escapedSelector = JSON.stringify(selector);

			const injectResult = await cdpCall(ws, "Runtime.evaluate", {
				expression: `(() => {
					const el = document.querySelector(${escapedSelector});
					if (!el) return { error: "element_not_found" };
					const nativeSetter = Object.getOwnPropertyDescriptor(
						Object.getPrototypeOf(el), 'value'
					)?.set || Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
					if (nativeSetter) nativeSetter.call(el, ${escapedValue});
					else el.value = ${escapedValue};
					el.dispatchEvent(new Event('input', { bubbles: true }));
					el.dispatchEvent(new Event('change', { bubbles: true }));
					return { ok: true };
				})()`,
				returnByValue: true,
			});

			value = null;

			const evalResult = (injectResult as unknown as CdpResult).result?.value as Record<string, unknown> | undefined;
			if (evalResult?.error === "element_not_found") {
				return error({ error: "element_not_found", selector });
			}

			return success({ filled: true, origin });
		} catch (err) {
			const e = err as OriginMismatchError;
			const result: Record<string, unknown> = { error: e.message };
			if (e.allowedOrigins) result.allowedOrigins = e.allowedOrigins;
			if (e.actualOrigin) result.actualOrigin = e.actualOrigin;
			return error(result);
		} finally {
			ws.close();
		}
	},
);

server.tool(
	"blind_type",
	"Type a sensitive vault field value using keyboard events. The target field must be focused. The secret never appears in the agent context.",
	{
		handle: z.string().describe("Vault item handle (vault-slug/item-slug)"),
		field: z.string().describe("Field name (e.g. password)"),
	},
	async ({ handle, field }) => {
		const ws = await connectCdp();
		try {
			const origin = await getBrowserOrigin(ws);
			let value: string | null = await fetchSecret(handle, field, origin);

			for (const char of value!) {
				await cdpCall(ws, "Input.dispatchKeyEvent", {
					type: "keyDown", text: char, key: char, unmodifiedText: char,
				});
				await cdpCall(ws, "Input.dispatchKeyEvent", {
					type: "keyUp", key: char,
				});
			}

			value = null;
			return success({ typed: true, origin });
		} catch (err) {
			const e = err as OriginMismatchError;
			const result: Record<string, unknown> = { error: e.message };
			if (e.allowedOrigins) result.allowedOrigins = e.allowedOrigins;
			if (e.actualOrigin) result.actualOrigin = e.actualOrigin;
			return error(result);
		} finally {
			ws.close();
		}
	},
);

const transport = new StdioServerTransport();
await server.connect(transport);
