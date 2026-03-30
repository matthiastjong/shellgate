/**
 * JWT RS256 signing utility using Node's native Web Crypto API.
 * Used for Google service account authentication.
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
	const normalized = pem.replace(/\\n/g, "\n");
	const stripped = normalized
		.replace(/-+BEGIN\s+PRIVATE\s+KEY-+/g, "")
		.replace(/-+END\s+PRIVATE\s+KEY-+/g, "")
		.replace(/\s/g, "");

	const buf = Buffer.from(stripped, "base64");
	return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

/**
 * Sign a JWT using RS256 (RSASSA-PKCS1-v1_5 with SHA-256).
 *
 * @param config Configuration for JWT signing
 * @param config.privateKey PEM-encoded PKCS#8 RSA private key
 * @param config.clientEmail Service account email (iss claim)
 * @param config.scopes Space-separated OAuth2 scopes
 * @param config.tokenUri Token endpoint URL (aud claim, defaults to Google's)
 * @param config.expiresInSeconds Token expiration time in seconds (defaults to 3600)
 * @returns Signed JWT string
 */
export async function signRS256JWT(config: {
	privateKey: string;
	clientEmail: string;
	scopes: string;
	tokenUri?: string;
	expiresInSeconds?: number;
}): Promise<string> {
	const tokenUri = config.tokenUri ?? "https://oauth2.googleapis.com/token";
	const expiresInSeconds = config.expiresInSeconds ?? 3600;

	const keyBuffer = parsePEM(config.privateKey);

	const cryptoKey = await crypto.subtle.importKey(
		"pkcs8",
		keyBuffer,
		{ name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
		false,
		["sign"],
	);

	const header = {
		alg: "RS256",
		typ: "JWT",
	};

	const now = Math.floor(Date.now() / 1000);
	const payload = {
		iss: config.clientEmail,
		scope: config.scopes,
		aud: tokenUri,
		iat: now,
		exp: now + expiresInSeconds,
	};

	const encodedHeader = base64url(new TextEncoder().encode(JSON.stringify(header)));
	const encodedPayload = base64url(new TextEncoder().encode(JSON.stringify(payload)));
	const message = `${encodedHeader}.${encodedPayload}`;

	const signature = await crypto.subtle.sign(
		"RSASSA-PKCS1-v1_5",
		cryptoKey,
		new TextEncoder().encode(message),
	);

	const encodedSignature = base64url(signature);

	return `${message}.${encodedSignature}`;
}
