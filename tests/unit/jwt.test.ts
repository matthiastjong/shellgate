import { describe, it, expect, beforeAll } from "vitest";
import { signES256JWT } from "../../src/lib/server/utils/jwt";

describe("JWT ES256 Signing", () => {
	let privateKeyPEM: string;
	let publicKey: CryptoKey;
	const testKeyId = "TESTKEY123";
	const testIssuerId = "test-issuer-uuid";

	beforeAll(async () => {
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
		privateKeyPEM = `-----BEGIN PRIVATE KEY-----\n${privateKeyBase64}\n-----END PRIVATE KEY-----`;

		// Store public key for verification
		publicKey = keyPair.publicKey;
	});

	it("should generate a valid 3-part JWT string", async () => {
		const jwt = await signES256JWT({
			privateKey: privateKeyPEM,
			keyId: testKeyId,
			issuerId: testIssuerId,
		});

		// JWT should have 3 parts separated by dots
		const parts = jwt.split(".");
		expect(parts).toHaveLength(3);

		// Each part should be base64url encoded (no padding)
		expect(parts[0]).toMatch(/^[A-Za-z0-9_-]+$/);
		expect(parts[1]).toMatch(/^[A-Za-z0-9_-]+$/);
		expect(parts[2]).toMatch(/^[A-Za-z0-9_-]+$/);
	});

	it("should have correct header with alg, kid, and typ", async () => {
		const jwt = await signES256JWT({
			privateKey: privateKeyPEM,
			keyId: testKeyId,
			issuerId: testIssuerId,
		});

		const [headerB64] = jwt.split(".");
		const headerJson = atob(headerB64.replace(/-/g, "+").replace(/_/g, "/"));
		const header = JSON.parse(headerJson);

		expect(header.alg).toBe("ES256");
		expect(header.kid).toBe(testKeyId);
		expect(header.typ).toBe("JWT");
	});

	it("should have correct payload with iss, aud, iat, and exp", async () => {
		const beforeTime = Math.floor(Date.now() / 1000);
		
		const jwt = await signES256JWT({
			privateKey: privateKeyPEM,
			keyId: testKeyId,
			issuerId: testIssuerId,
		});

		const afterTime = Math.floor(Date.now() / 1000);

		const [, payloadB64] = jwt.split(".");
		const payloadJson = atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/"));
		const payload = JSON.parse(payloadJson);

		expect(payload.iss).toBe(testIssuerId);
		expect(payload.aud).toBe("appstoreconnect-v1");
		expect(payload.iat).toBeGreaterThanOrEqual(beforeTime);
		expect(payload.iat).toBeLessThanOrEqual(afterTime);
		expect(payload.exp).toBe(payload.iat + 1200); // Default 20 minutes
	});

	it("should generate a valid signature verifiable with the public key", async () => {
		const jwt = await signES256JWT({
			privateKey: privateKeyPEM,
			keyId: testKeyId,
			issuerId: testIssuerId,
		});

		const [headerB64, payloadB64, signatureB64] = jwt.split(".");
		const message = `${headerB64}.${payloadB64}`;

		// Decode signature from base64url
		const signatureStr = atob(signatureB64.replace(/-/g, "+").replace(/_/g, "/"));
		const signature = new Uint8Array(signatureStr.length);
		for (let i = 0; i < signatureStr.length; i++) {
			signature[i] = signatureStr.charCodeAt(i);
		}

		// Verify signature
		const isValid = await crypto.subtle.verify(
			{ name: "ECDSA", hash: "SHA-256" },
			publicKey,
			signature,
			new TextEncoder().encode(message),
		);

		expect(isValid).toBe(true);
	});

	it("should support custom audience", async () => {
		const customAudience = "custom-api-v2";

		const jwt = await signES256JWT({
			privateKey: privateKeyPEM,
			keyId: testKeyId,
			issuerId: testIssuerId,
			audience: customAudience,
		});

		const [, payloadB64] = jwt.split(".");
		const payloadJson = atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/"));
		const payload = JSON.parse(payloadJson);

		expect(payload.aud).toBe(customAudience);
	});

	it("should support custom expiration time", async () => {
		const customExpires = 3600; // 1 hour

		const jwt = await signES256JWT({
			privateKey: privateKeyPEM,
			keyId: testKeyId,
			issuerId: testIssuerId,
			expiresInSeconds: customExpires,
		});

		const [, payloadB64] = jwt.split(".");
		const payloadJson = atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/"));
		const payload = JSON.parse(payloadJson);

		expect(payload.exp).toBe(payload.iat + customExpires);
	});

	it("should throw error for invalid PEM format", async () => {
		await expect(
			signES256JWT({
				privateKey: "not-a-valid-pem",
				keyId: testKeyId,
				issuerId: testIssuerId,
			}),
		).rejects.toThrow();
	});
});
