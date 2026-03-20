import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { proxyRequest } from "$lib/server/services/gateway";
import { updateTarget } from "$lib/server/services/targets";
import type { Token } from "$lib/server/db/schema";
import { db } from "$lib/server/db";
import { tokens } from "$lib/server/db/schema";
import { eq } from "drizzle-orm";
import {
	createTestToken,
	createTestTarget,
	createTestAuthMethod,
	grantPermission,
	truncateAll,
} from "../helpers";

async function getFullToken(tokenId: string): Promise<Token> {
	const [row] = await db.select().from(tokens).where(eq(tokens.id, tokenId)).limit(1);
	return row;
}

describe("gateway proxy", () => {
	beforeEach(async () => {
		await truncateAll();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("proxies request with bearer credential injected", async () => {
		const { token: tokenRow } = await createTestToken();
		const target = await createTestTarget("OpenAI", "https://api.openai.com");
		await createTestAuthMethod(target.id, { credential: "sk-real-key-1234567890" });
		await grantPermission(tokenRow.id, target.id);

		const fullToken = await getFullToken(tokenRow.id);

		const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ choices: [] }));

		const request = new Request(`http://localhost/gateway/${target.slug}/v1/chat/completions`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ model: "gpt-4" }),
		});

		const response = await proxyRequest(fullToken, target.slug, "v1/chat/completions", request);

		expect(response.status).toBe(200);
		expect(fetchSpy).toHaveBeenCalledOnce();
		const [url, init] = fetchSpy.mock.calls[0];
		expect(url).toBe("https://api.openai.com/v1/chat/completions");
		expect((init!.headers as Headers).get("Authorization")).toBe("Bearer sk-real-key-1234567890");
	});

	it("proxies request with basic auth credential injected", async () => {
		const { token: tokenRow } = await createTestToken();
		const target = await createTestTarget("BasicAPI", "https://api.basic.com");
		await createTestAuthMethod(target.id, { type: "basic", credential: "admin:secret123" });
		await grantPermission(tokenRow.id, target.id);

		const fullToken = await getFullToken(tokenRow.id);

		const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ ok: true }));

		const request = new Request(`http://localhost/gateway/${target.slug}/data`, {
			method: "GET",
		});

		const response = await proxyRequest(fullToken, target.slug, "data", request);

		expect(response.status).toBe(200);
		expect(fetchSpy).toHaveBeenCalledOnce();
		const [, init] = fetchSpy.mock.calls[0];
		const expectedBasic = `Basic ${Buffer.from("admin:secret123").toString("base64")}`;
		expect((init!.headers as Headers).get("Authorization")).toBe(expectedBasic);
	});

	it("proxies request with custom header credential injected", async () => {
		const { token: tokenRow } = await createTestToken();
		const target = await createTestTarget("CustomAPI", "https://api.custom.com");
		await createTestAuthMethod(target.id, { type: "custom_header", credential: "X-API-Key: my-secret-key" });
		await grantPermission(tokenRow.id, target.id);

		const fullToken = await getFullToken(tokenRow.id);

		const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ ok: true }));

		const request = new Request(`http://localhost/gateway/${target.slug}/data`, {
			method: "GET",
		});

		const response = await proxyRequest(fullToken, target.slug, "data", request);

		expect(response.status).toBe(200);
		expect(fetchSpy).toHaveBeenCalledOnce();
		const [, init] = fetchSpy.mock.calls[0];
		expect((init!.headers as Headers).get("X-API-Key")).toBe("my-secret-key");
	});

	it("passes query string to upstream", async () => {
		const { token: tokenRow } = await createTestToken();
		const target = await createTestTarget("QueryTest", "https://api.example.com");
		await createTestAuthMethod(target.id);
		await grantPermission(tokenRow.id, target.id);

		const fullToken = await getFullToken(tokenRow.id);

		vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ ok: true }));

		const request = new Request(`http://localhost/gateway/${target.slug}/v1/models?limit=10&offset=0`);

		await proxyRequest(fullToken, target.slug, "v1/models", request);

		const [url] = vi.mocked(fetch).mock.calls[0];
		expect(url).toContain("?limit=10&offset=0");
	});

	it("proxies without Authorization when no default auth method", async () => {
		const { token: tokenRow } = await createTestToken();
		const target = await createTestTarget("NoAuthAPI", "https://api.noauth.com");
		await grantPermission(tokenRow.id, target.id);

		const fullToken = await getFullToken(tokenRow.id);

		vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ ok: true }));

		const request = new Request(`http://localhost/gateway/${target.slug}/data`);

		await proxyRequest(fullToken, target.slug, "data", request);

		const [, init] = vi.mocked(fetch).mock.calls[0];
		expect((init!.headers as Headers).has("Authorization")).toBe(false);
	});

	it("returns 404 for unknown target", async () => {
		const { token: tokenRow } = await createTestToken();
		const fullToken = await getFullToken(tokenRow.id);

		const request = new Request("http://localhost/gateway/nonexistent/path");
		const response = await proxyRequest(fullToken, "nonexistent", "path", request);

		expect(response.status).toBe(404);
	});

	it("returns 404 for disabled target", async () => {
		const { token: tokenRow } = await createTestToken();
		const target = await createTestTarget("DisabledAPI", "https://api.disabled.com");
		await grantPermission(tokenRow.id, target.id);
		await updateTarget(target.id, { enabled: false });

		const fullToken = await getFullToken(tokenRow.id);

		const request = new Request(`http://localhost/gateway/${target.slug}/path`);
		const response = await proxyRequest(fullToken, target.slug, "path", request);

		expect(response.status).toBe(404);
	});

	it("returns 403 when token lacks permission", async () => {
		const { token: tokenRow } = await createTestToken();
		const target = await createTestTarget("RestrictedAPI", "https://api.restricted.com");

		const fullToken = await getFullToken(tokenRow.id);

		const request = new Request(`http://localhost/gateway/${target.slug}/path`);
		const response = await proxyRequest(fullToken, target.slug, "path", request);

		expect(response.status).toBe(403);
	});

	it("returns 400 for path traversal attempt", async () => {
		const { token: tokenRow } = await createTestToken();
		const target = await createTestTarget("TraversalAPI", "https://api.traversal.com");
		await createTestAuthMethod(target.id);
		await grantPermission(tokenRow.id, target.id);

		const fullToken = await getFullToken(tokenRow.id);

		const request = new Request(`http://localhost/gateway/${target.slug}/..%2F..%2Fetc/passwd`);
		const response = await proxyRequest(fullToken, target.slug, "..%2F..%2Fetc/passwd", request);

		expect(response.status).toBe(400);
	});
});
