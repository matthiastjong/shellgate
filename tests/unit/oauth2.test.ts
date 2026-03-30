import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getServiceAccountToken, clearTokenCache } from "../../src/lib/server/utils/oauth2";

// Generate an RSA key pair once for all tests
let privateKeyPEM: string;

beforeEach(async () => {
	clearTokenCache();

	if (!privateKeyPEM) {
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
		privateKeyPEM = `-----BEGIN PRIVATE KEY-----\n${privateKeyBase64}\n-----END PRIVATE KEY-----`;
	}
});

afterEach(() => {
	vi.restoreAllMocks();
});

const baseConfig = () => ({
	privateKey: privateKeyPEM,
	clientEmail: "test@test-project.iam.gserviceaccount.com",
	scopes: "https://www.googleapis.com/auth/devstorage.read_only",
});

describe("OAuth2 Service Account Token Exchange", () => {
	it("should exchange JWT for access_token", async () => {
		const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
			Response.json({ access_token: "ya29.mock-token", expires_in: 3600 }),
		);

		const token = await getServiceAccountToken(baseConfig());

		expect(token).toBe("ya29.mock-token");
		expect(fetchSpy).toHaveBeenCalledOnce();

		const [url, init] = fetchSpy.mock.calls[0];
		expect(url).toBe("https://oauth2.googleapis.com/token");
		expect(init!.method).toBe("POST");
		expect((init!.headers as Record<string, string>)["Content-Type"]).toBe(
			"application/x-www-form-urlencoded",
		);
		expect((init!.body as string)).toContain("grant_type=");
		expect((init!.body as string)).toContain("assertion=");
	});

	it("should return cached token on second call", async () => {
		const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
			Response.json({ access_token: "ya29.cached", expires_in: 3600 }),
		);

		const token1 = await getServiceAccountToken(baseConfig());
		const token2 = await getServiceAccountToken(baseConfig());

		expect(token1).toBe("ya29.cached");
		expect(token2).toBe("ya29.cached");
		expect(fetchSpy).toHaveBeenCalledOnce();
	});

	it("should refresh expired token", async () => {
		const fetchSpy = vi.spyOn(globalThis, "fetch")
			.mockResolvedValueOnce(
				Response.json({ access_token: "ya29.first", expires_in: 0 }),
			)
			.mockResolvedValueOnce(
				Response.json({ access_token: "ya29.second", expires_in: 3600 }),
			);

		const token1 = await getServiceAccountToken(baseConfig());
		expect(token1).toBe("ya29.first");

		// expires_in: 0 means already expired, so second call should re-fetch
		const token2 = await getServiceAccountToken(baseConfig());
		expect(token2).toBe("ya29.second");
		expect(fetchSpy).toHaveBeenCalledTimes(2);
	});

	it("should throw on non-200 response", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response('{"error": "invalid_grant"}', { status: 400 }),
		);

		await expect(getServiceAccountToken(baseConfig())).rejects.toThrow(
			"Token exchange failed (400)",
		);
	});

	it("should use custom tokenUri", async () => {
		const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
			Response.json({ access_token: "ya29.custom", expires_in: 3600 }),
		);

		const config = {
			...baseConfig(),
			tokenUri: "https://custom.endpoint/token",
		};

		await getServiceAccountToken(config);

		const [url] = fetchSpy.mock.calls[0];
		expect(url).toBe("https://custom.endpoint/token");
	});
});
