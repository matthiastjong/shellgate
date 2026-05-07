import { describe, it, expect, beforeAll } from "vitest";
import { encrypt, decrypt } from "$lib/server/utils/crypto";

describe("crypto", () => {
	beforeAll(() => {
		// Set a test encryption key (32 bytes base64)
		process.env.VAULT_ENCRYPTION_KEY = Buffer.from("a]3Fq!9Lp@2Xw#7Yz&5Bv*8Cn$4Dm%6E").toString("base64");
	});

	it("encrypts and decrypts a value", () => {
		const plaintext = "my-secret-password";
		const encrypted = encrypt(plaintext);
		expect(encrypted).not.toBe(plaintext);
		expect(encrypted).toContain(":");
		const decrypted = decrypt(encrypted);
		expect(decrypted).toBe(plaintext);
	});

	it("produces different ciphertexts for the same input (random IV)", () => {
		const a = encrypt("same");
		const b = encrypt("same");
		expect(a).not.toBe(b);
	});

	it("throws on tampered ciphertext", () => {
		const encrypted = encrypt("test");
		const parts = encrypted.split(":");
		parts[1] = Buffer.from("tampered").toString("base64");
		expect(() => decrypt(parts.join(":"))).toThrow();
	});

	it("throws when VAULT_ENCRYPTION_KEY is not set", () => {
		const orig = process.env.VAULT_ENCRYPTION_KEY;
		delete process.env.VAULT_ENCRYPTION_KEY;
		expect(() => encrypt("test")).toThrow("VAULT_ENCRYPTION_KEY");
		process.env.VAULT_ENCRYPTION_KEY = orig;
	});
});
