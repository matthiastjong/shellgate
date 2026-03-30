import { describe, it, expect, beforeAll } from "vitest";
import { signRS256JWT } from "../../src/lib/server/utils/jwt-rs256";

describe("JWT RS256 Signing", () => {
	let privateKeyPEM: string;
	let publicKey: CryptoKey;
	const testClientEmail = "test@test-project.iam.gserviceaccount.com";
	const testScopes = "https://www.googleapis.com/auth/devstorage.read_only";

	beforeAll(async () => {
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

		publicKey = keyPair.publicKey;
	});

	it("should generate a valid 3-part JWT string", async () => {
		const jwt = await signRS256JWT({
			privateKey: privateKeyPEM,
			clientEmail: testClientEmail,
			scopes: testScopes,
		});

		const parts = jwt.split(".");
		expect(parts).toHaveLength(3);
		expect(parts[0]).toMatch(/^[A-Za-z0-9_-]+$/);
		expect(parts[1]).toMatch(/^[A-Za-z0-9_-]+$/);
		expect(parts[2]).toMatch(/^[A-Za-z0-9_-]+$/);
	});

	it("should have correct header with alg and typ", async () => {
		const jwt = await signRS256JWT({
			privateKey: privateKeyPEM,
			clientEmail: testClientEmail,
			scopes: testScopes,
		});

		const [headerB64] = jwt.split(".");
		const headerJson = atob(headerB64.replace(/-/g, "+").replace(/_/g, "/"));
		const header = JSON.parse(headerJson);

		expect(header.alg).toBe("RS256");
		expect(header.typ).toBe("JWT");
	});

	it("should have correct payload with iss, scope, aud, iat, and exp", async () => {
		const beforeTime = Math.floor(Date.now() / 1000);

		const jwt = await signRS256JWT({
			privateKey: privateKeyPEM,
			clientEmail: testClientEmail,
			scopes: testScopes,
		});

		const afterTime = Math.floor(Date.now() / 1000);

		const [, payloadB64] = jwt.split(".");
		const payloadJson = atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/"));
		const payload = JSON.parse(payloadJson);

		expect(payload.iss).toBe(testClientEmail);
		expect(payload.scope).toBe(testScopes);
		expect(payload.aud).toBe("https://oauth2.googleapis.com/token");
		expect(payload.iat).toBeGreaterThanOrEqual(beforeTime);
		expect(payload.iat).toBeLessThanOrEqual(afterTime);
		expect(payload.exp).toBe(payload.iat + 3600);
	});

	it("should generate a valid signature verifiable with the public key", async () => {
		const jwt = await signRS256JWT({
			privateKey: privateKeyPEM,
			clientEmail: testClientEmail,
			scopes: testScopes,
		});

		const [headerB64, payloadB64, signatureB64] = jwt.split(".");
		const message = `${headerB64}.${payloadB64}`;

		const signatureStr = atob(signatureB64.replace(/-/g, "+").replace(/_/g, "/"));
		const signature = new Uint8Array(signatureStr.length);
		for (let i = 0; i < signatureStr.length; i++) {
			signature[i] = signatureStr.charCodeAt(i);
		}

		const isValid = await crypto.subtle.verify(
			"RSASSA-PKCS1-v1_5",
			publicKey,
			signature,
			new TextEncoder().encode(message),
		);

		expect(isValid).toBe(true);
	});

	it("should support custom tokenUri", async () => {
		const customUri = "https://custom.token.endpoint/token";

		const jwt = await signRS256JWT({
			privateKey: privateKeyPEM,
			clientEmail: testClientEmail,
			scopes: testScopes,
			tokenUri: customUri,
		});

		const [, payloadB64] = jwt.split(".");
		const payloadJson = atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/"));
		const payload = JSON.parse(payloadJson);

		expect(payload.aud).toBe(customUri);
	});

	it("should support custom expiration time", async () => {
		const customExpires = 1800;

		const jwt = await signRS256JWT({
			privateKey: privateKeyPEM,
			clientEmail: testClientEmail,
			scopes: testScopes,
			expiresInSeconds: customExpires,
		});

		const [, payloadB64] = jwt.split(".");
		const payloadJson = atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/"));
		const payload = JSON.parse(payloadJson);

		expect(payload.exp).toBe(payload.iat + customExpires);
	});

	it("should throw error for invalid PEM format", async () => {
		await expect(
			signRS256JWT({
				privateKey: "not-a-valid-pem",
				clientEmail: testClientEmail,
				scopes: testScopes,
			}),
		).rejects.toThrow();
	});
});
