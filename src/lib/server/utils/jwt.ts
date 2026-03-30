/**
 * JWT ES256 signing utility using Node's native Web Crypto API.
 * No external dependencies required.
 */

/**
 * Convert ArrayBuffer or Uint8Array to base64url encoding (no padding).
 */
function base64url(buffer: ArrayBuffer | Uint8Array): string {
	const bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer;
	let binary = "";
	for (let i = 0; i < bytes.length; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return btoa(binary)
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=/g, "");
}

/**
 * Parse PEM-encoded PKCS#8 private key and return raw key bytes.
 */
function parsePEM(pem: string): ArrayBuffer {
	// Remove header, footer, and newlines
	const stripped = pem
		.replace(/-----BEGIN PRIVATE KEY-----/g, "")
		.replace(/-----END PRIVATE KEY-----/g, "")
		.replace(/\s/g, "");

	// Base64 decode to ArrayBuffer
	const binary = atob(stripped);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes.buffer;
}

/**
 * Sign a JWT using ES256 (ECDSA with P-256 and SHA-256).
 * 
 * @param config Configuration for JWT signing
 * @param config.privateKey PEM-encoded PKCS#8 private key
 * @param config.keyId Apple key ID (goes in JWT header as "kid")
 * @param config.issuerId Apple issuer ID (goes in JWT payload as "iss")
 * @param config.audience JWT audience (defaults to "appstoreconnect-v1")
 * @param config.expiresInSeconds Token expiration time in seconds (defaults to 1200 = 20 minutes)
 * @returns Signed JWT string
 */
export async function signES256JWT(config: {
	privateKey: string;
	keyId: string;
	issuerId: string;
	audience?: string;
	expiresInSeconds?: number;
}): Promise<string> {
	const audience = config.audience ?? "appstoreconnect-v1";
	const expiresInSeconds = config.expiresInSeconds ?? 1200;

	// Parse PEM-encoded private key
	const keyBuffer = parsePEM(config.privateKey);

	// Import private key for ECDSA signing
	const cryptoKey = await crypto.subtle.importKey(
		"pkcs8",
		keyBuffer,
		{ name: "ECDSA", namedCurve: "P-256" },
		false,
		["sign"],
	);

	// Build JWT header
	const header = {
		alg: "ES256",
		kid: config.keyId,
		typ: "JWT",
	};

	// Build JWT payload
	const now = Math.floor(Date.now() / 1000);
	const payload = {
		iss: config.issuerId,
		aud: audience,
		iat: now,
		exp: now + expiresInSeconds,
	};

	// Encode header and payload
	const encodedHeader = base64url(new TextEncoder().encode(JSON.stringify(header)));
	const encodedPayload = base64url(new TextEncoder().encode(JSON.stringify(payload)));
	const message = `${encodedHeader}.${encodedPayload}`;

	// Sign the message
	const signature = await crypto.subtle.sign(
		{ name: "ECDSA", hash: "SHA-256" },
		cryptoKey,
		new TextEncoder().encode(message),
	);

	// Web Crypto returns raw r||s signature (64 bytes for P-256)
	// This is exactly what JWT ES256 expects
	const encodedSignature = base64url(signature);

	return `${message}.${encodedSignature}`;
}
