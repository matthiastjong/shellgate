// Source file for blind-fill MCP server.
// Bundled with esbuild into blind-fill.bundle.mjs (self-contained, zero runtime deps).
// Env: SHELLGATE_URL, SHELLGATE_TOKEN, CDP_URL (default http://localhost:9222)

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

async function getActivePage() {
	const res = await fetch(`${CDP_URL}/json`, { signal: AbortSignal.timeout(5000) });
	if (!res.ok) throw new Error("cdp_connection_failed");
	const targets = await res.json();
	const page = targets.find((t) => t.type === "page");
	if (!page) throw new Error("no_active_page");
	return page;
}

let cdpIdCounter = 1;

function cdpCall(ws, method, params = {}) {
	return new Promise((resolve, reject) => {
		const id = cdpIdCounter++;
		const handler = (data) => {
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

async function connectCdp() {
	const page = await getActivePage();
	const ws = new WebSocket(page.webSocketDebuggerUrl);
	await new Promise((resolve, reject) => {
		const timeout = setTimeout(() => { ws.close(); reject(new Error("cdp_connection_timeout")); }, 5000);
		ws.once("open", () => { clearTimeout(timeout); resolve(); });
		ws.once("error", (err) => { clearTimeout(timeout); reject(err); });
	});
	return ws;
}

async function getBrowserOrigin(ws) {
	const result = await cdpCall(ws, "Runtime.evaluate", {
		expression: "window.location.origin",
		returnByValue: true,
	});
	return result.result.value;
}

// --- Shellgate API ---

async function fetchSecret(handle, field, origin) {
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
				if (e.message === "origin_mismatch") throw e;
			}
		}
		throw new Error("auth_failed");
	}
	if (res.status === 404) throw new Error("not_found");
	if (!res.ok) throw new Error(`shellgate_error_${res.status}`);

	const data = await res.json();
	return data.value;
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
			let value = await fetchSecret(handle, field, origin);

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

			const evalResult = injectResult.result?.value;
			if (evalResult?.error === "element_not_found") {
				return { content: [{ type: "text", text: JSON.stringify({ error: "element_not_found", selector }) }], isError: true };
			}

			return { content: [{ type: "text", text: JSON.stringify({ filled: true, origin }) }] };
		} catch (err) {
			const result = { error: err.message };
			if (err.allowedOrigins) result.allowedOrigins = err.allowedOrigins;
			if (err.actualOrigin) result.actualOrigin = err.actualOrigin;
			return { content: [{ type: "text", text: JSON.stringify(result) }], isError: true };
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
			let value = await fetchSecret(handle, field, origin);

			for (const char of value) {
				await cdpCall(ws, "Input.dispatchKeyEvent", {
					type: "keyDown", text: char, key: char, unmodifiedText: char,
				});
				await cdpCall(ws, "Input.dispatchKeyEvent", {
					type: "keyUp", key: char,
				});
			}

			value = null;
			return { content: [{ type: "text", text: JSON.stringify({ typed: true, origin }) }] };
		} catch (err) {
			const result = { error: err.message };
			if (err.allowedOrigins) result.allowedOrigins = err.allowedOrigins;
			if (err.actualOrigin) result.actualOrigin = err.actualOrigin;
			return { content: [{ type: "text", text: JSON.stringify(result) }], isError: true };
		} finally {
			ws.close();
		}
	},
);

const transport = new StdioServerTransport();
await server.connect(transport);
