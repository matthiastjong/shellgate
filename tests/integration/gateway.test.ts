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

	it("proxies request with query_param credential injected", async () => {
		const { token: tokenRow } = await createTestToken();
		const target = await createTestTarget("SemrushAPI", "https://api.semrush.com");
		await createTestAuthMethod(target.id, { type: "query_param", credential: "key:abc-semrush-key-1234" });
		await grantPermission(tokenRow.id, target.id);

		const fullToken = await getFullToken(tokenRow.id);

		const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ ok: true }));

		const request = new Request(`http://localhost/gateway/${target.slug}/analytics/ta/api/v3/summary`, {
			method: "GET",
		});

		const response = await proxyRequest(fullToken, target.slug, "analytics/ta/api/v3/summary", request);

		expect(response.status).toBe(200);
		expect(fetchSpy).toHaveBeenCalledOnce();
		const [url] = fetchSpy.mock.calls[0];
		expect(url).toContain("key=abc-semrush-key-1234");
		expect(url).not.toContain("Authorization");
	});

	it("query_param auth is appended alongside existing query params", async () => {
		const { token: tokenRow } = await createTestToken();
		const target = await createTestTarget("QueryParamAPI", "https://api.example.com");
		await createTestAuthMethod(target.id, { type: "query_param", credential: "api_key:secret123" });
		await grantPermission(tokenRow.id, target.id);

		const fullToken = await getFullToken(tokenRow.id);

		vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ ok: true }));

		const request = new Request(`http://localhost/gateway/${target.slug}/v1/data?domain=example.com&export=json`);

		await proxyRequest(fullToken, target.slug, "v1/data", request);

		const [url] = vi.mocked(fetch).mock.calls[0];
		expect(url).toContain("domain=example.com");
		expect(url).toContain("export=json");
		expect(url).toContain("api_key=secret123");
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

	it("proxies request with jwt_es256 credential - generates fresh JWT", async () => {
		// Generate a test P-256 key pair
		const keyPair = await crypto.subtle.generateKey(
			{ name: "ECDSA", namedCurve: "P-256" },
			true,
			["sign", "verify"],
		);

		// Export private key as PKCS#8 PEM
		const privateKeyBuffer = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey);
		const privateKeyBase64 = btoa(
			String.fromCharCode(...new Uint8Array(privateKeyBuffer)),
		);
		const privateKeyPEM = `-----BEGIN PRIVATE KEY-----\n${privateKeyBase64}\n-----END PRIVATE KEY-----`;

		const testConfig = {
			privateKey: privateKeyPEM,
			keyId: "TESTKEY123",
			issuerId: "test-issuer-uuid",
		};

		const { token: tokenRow } = await createTestToken();
		const target = await createTestTarget("AppleAPI", "https://api.appstoreconnect.apple.com");
		await createTestAuthMethod(target.id, {
			type: "jwt_es256",
			credential: JSON.stringify(testConfig),
		});
		await grantPermission(tokenRow.id, target.id);

		const fullToken = await getFullToken(tokenRow.id);

		const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ ok: true }));

		const request = new Request(`http://localhost/gateway/${target.slug}/v1/apps`, {
			method: "GET",
		});

		const response = await proxyRequest(fullToken, target.slug, "v1/apps", request);

		expect(response.status).toBe(200);
		expect(fetchSpy).toHaveBeenCalledOnce();
		const [, init] = fetchSpy.mock.calls[0];
		const authHeader = (init!.headers as Headers).get("Authorization");

		// Verify Authorization header starts with "Bearer ey" (JWT marker)
		expect(authHeader).toMatch(/^Bearer ey/);

		// Decode and verify JWT structure
		const jwt = authHeader!.replace("Bearer ", "");
		const [headerB64, payloadB64] = jwt.split(".");

		// Decode header
		const headerJson = atob(headerB64.replace(/-/g, "+").replace(/_/g, "/"));
		const header = JSON.parse(headerJson);
		expect(header.alg).toBe("ES256");
		expect(header.kid).toBe("TESTKEY123");
		expect(header.typ).toBe("JWT");

		// Decode payload
		const payloadJson = atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/"));
		const payload = JSON.parse(payloadJson);
		expect(payload.iss).toBe("test-issuer-uuid");
		expect(payload.aud).toBe("appstoreconnect-v1");
		expect(payload.iat).toBeGreaterThan(0);
		expect(payload.exp).toBeGreaterThan(payload.iat);
	});

	it("proxies request with oauth2_service_account credential - exchanges for access_token", async () => {
		// Generate a test RSA key pair
		const keyPair = await crypto.subtle.generateKey(
			{
				name: "RSASSA-PKCS1-v1_5",
				modulusLength: 2048,
				publicExponent: new Uint8Array([1, 0, 1]),
				hash: "SHA-256",
			},
			true,
			["sign", "verify"],
		);

		const privateKeyBuffer = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey);
		const privateKeyBase64 = btoa(
			String.fromCharCode(...new Uint8Array(privateKeyBuffer)),
		);
		const privateKeyPEM = `-----BEGIN PRIVATE KEY-----\n${privateKeyBase64}\n-----END PRIVATE KEY-----`;

		const saCredential = JSON.stringify({
			type: "service_account",
			client_email: "test@test-project.iam.gserviceaccount.com",
			private_key: privateKeyPEM,
			token_uri: "https://oauth2.googleapis.com/token",
			scopes: "https://www.googleapis.com/auth/devstorage.read_only",
		});

		const { token: tokenRow } = await createTestToken();
		const target = await createTestTarget("GoogleAPI", "https://storage.googleapis.com");
		await createTestAuthMethod(target.id, {
			type: "oauth2_service_account",
			credential: saCredential,
		});
		await grantPermission(tokenRow.id, target.id);

		const fullToken = await getFullToken(tokenRow.id);

		// Clear token cache so the test always hits the token endpoint
		const { clearTokenCache } = await import("$lib/server/utils/oauth2");
		clearTokenCache();

		let fetchCallCount = 0;
		const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
			fetchCallCount++;
			const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

			if (url === "https://oauth2.googleapis.com/token") {
				return Response.json({ access_token: "ya29.mock-gcs-token", expires_in: 3600 });
			}

			return Response.json({ kind: "storage#objects", items: [] });
		});

		const request = new Request(`http://localhost/gateway/${target.slug}/storage/v1/b/my-bucket/o`, {
			method: "GET",
		});

		const response = await proxyRequest(fullToken, target.slug, "storage/v1/b/my-bucket/o", request);

		expect(response.status).toBe(200);
		expect(fetchCallCount).toBe(2);

		// First call should be token exchange
		const [tokenUrl] = fetchSpy.mock.calls[0];
		expect(tokenUrl).toBe("https://oauth2.googleapis.com/token");

		// Second call should be upstream with Bearer token
		const [upstreamUrl, upstreamInit] = fetchSpy.mock.calls[1];
		expect(upstreamUrl).toBe("https://storage.googleapis.com/storage/v1/b/my-bucket/o");
		expect((upstreamInit!.headers as Headers).get("Authorization")).toBe("Bearer ya29.mock-gcs-token");
	});
});
