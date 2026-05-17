// src/local-mcp/blind-fill.mjs
// Self-contained MCP stdio server for blind-filling browser fields with vault secrets.
// No external dependencies — uses Node built-ins only.
// Env: SHELLGATE_URL, SHELLGATE_TOKEN, CDP_URL (default http://localhost:9222)

// Prefer the `ws` package (Node EventEmitter API: on/once/removeListener).
// The global WebSocket (Node 22+) uses the browser API which lacks these methods.
let WS;
try { WS = (await import("ws")).default; } catch {
	WS = globalThis.WebSocket;
}

const SHELLGATE_URL = process.env.SHELLGATE_URL?.replace(/\/+$/, "");
const SHELLGATE_TOKEN = process.env.SHELLGATE_TOKEN;
const CDP_URL = process.env.CDP_URL || "http://localhost:9222";

if (!SHELLGATE_URL || !SHELLGATE_TOKEN) {
	process.stderr.write("SHELLGATE_URL and SHELLGATE_TOKEN are required\n");
	process.exit(1);
}

// --- Minimal MCP stdio protocol (JSON-RPC 2.0) ---

function send(msg) {
	const body = JSON.stringify(msg);
	const header = `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n`;
	process.stdout.write(header + body);
}

const TOOLS = [
	{
		name: "blind_fill",
		description: "Fill a sensitive vault field into a browser element via CSS selector. The secret never appears in the agent context.",
		inputSchema: {
			type: "object",
			properties: {
				handle: { type: "string", description: "Vault item handle (vault-slug/item-slug)" },
				field: { type: "string", description: "Field name (e.g. password)" },
				selector: { type: "string", description: "CSS selector for the target DOM element" },
			},
			required: ["handle", "field", "selector"],
		},
	},
	{
		name: "blind_type",
		description: "Type a sensitive vault field value using keyboard events. The target field must be focused. The secret never appears in the agent context.",
		inputSchema: {
			type: "object",
			properties: {
				handle: { type: "string", description: "Vault item handle (vault-slug/item-slug)" },
				field: { type: "string", description: "Field name (e.g. password)" },
			},
			required: ["handle", "field"],
		},
	},
];

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
	const ws = new WS(page.webSocketDebuggerUrl);
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

// --- Tool handlers ---

async function handleBlindFill({ handle, field, selector }) {
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

		value = null; // clear secret from memory

		const evalResult = injectResult.result?.value;
		if (evalResult?.error === "element_not_found") {
			return { error: "element_not_found", selector };
		}

		return { filled: true, origin };
	} finally {
		ws.close();
	}
}

async function handleBlindType({ handle, field }) {
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

		value = null; // clear secret from memory
		return { typed: true, origin };
	} finally {
		ws.close();
	}
}

async function handleToolCall(name, args) {
	try {
		if (name === "blind_fill") return await handleBlindFill(args);
		if (name === "blind_type") return await handleBlindType(args);
		return { error: `unknown tool: ${name}` };
	} catch (err) {
		const result = { error: err.message };
		if (err.allowedOrigins) result.allowedOrigins = err.allowedOrigins;
		if (err.actualOrigin) result.actualOrigin = err.actualOrigin;
		return result;
	}
}

// --- MCP message handling ---

async function handleMessage(msg) {
	if (msg.method === "initialize") {
		send({
			jsonrpc: "2.0", id: msg.id,
			result: {
				protocolVersion: "2024-11-05",
				capabilities: { tools: {} },
				serverInfo: { name: "shellgate-secrets", version: "1.0.0" },
			},
		});
	} else if (msg.method === "notifications/initialized") {
		// no-op
	} else if (msg.method === "tools/list") {
		send({ jsonrpc: "2.0", id: msg.id, result: { tools: TOOLS } });
	} else if (msg.method === "tools/call") {
		const result = await handleToolCall(msg.params.name, msg.params.arguments ?? {});
		const isError = !!result.error;
		send({
			jsonrpc: "2.0", id: msg.id,
			result: {
				content: [{ type: "text", text: JSON.stringify(result) }],
				isError,
			},
		});
	} else {
		send({ jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: "Method not found" } });
	}
}

// --- Stdio transport (Content-Length framing) ---

let buffer = "";

process.stdin.setEncoding("utf-8");
process.stdin.on("data", (chunk) => {
	buffer += chunk;
	while (true) {
		const headerEnd = buffer.indexOf("\r\n\r\n");
		if (headerEnd === -1) break;
		const header = buffer.slice(0, headerEnd);
		const match = header.match(/Content-Length:\s*(\d+)/i);
		if (!match) { buffer = buffer.slice(headerEnd + 4); continue; }
		const len = parseInt(match[1], 10);
		const bodyStart = headerEnd + 4;
		if (buffer.length < bodyStart + len) break;
		const body = buffer.slice(bodyStart, bodyStart + len);
		buffer = buffer.slice(bodyStart + len);
		try {
			handleMessage(JSON.parse(body)).catch((err) => {
				process.stderr.write(`Handler error: ${err.message}\n`);
			});
		} catch (err) {
			process.stderr.write(`Parse error: ${err.message}\n`);
		}
	}
});

process.stderr.write("[shellgate-secrets] MCP server started\n");
