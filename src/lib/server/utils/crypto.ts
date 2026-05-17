import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function getKey(): Buffer {
	const b64 = process.env.VAULT_ENCRYPTION_KEY;
	if (!b64) throw new Error("VAULT_ENCRYPTION_KEY environment variable is required");
	return Buffer.from(b64, "base64");
}

export function encrypt(plaintext: string): string {
	const key = getKey();
	const iv = randomBytes(IV_LENGTH);
	const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
	const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
	const authTag = cipher.getAuthTag();
	return `${iv.toString("base64")}:${encrypted.toString("base64")}:${authTag.toString("base64")}`;
}

export function decrypt(encryptedValue: string): string {
	const key = getKey();
	const [ivB64, ciphertextB64, authTagB64] = encryptedValue.split(":");
	const iv = Buffer.from(ivB64, "base64");
	const ciphertext = Buffer.from(ciphertextB64, "base64");
	const authTag = Buffer.from(authTagB64, "base64");
	const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
	decipher.setAuthTag(authTag);
	return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
