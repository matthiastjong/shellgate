import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "$env/dynamic/private";

function getSecret(): string {
	const secret = env.SESSION_SECRET;
	if (!secret) throw new Error("SESSION_SECRET environment variable is required");
	return secret;
}

function sign(payload: string, secret: string): string {
	return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createSession(email: string): string {
	const payload = `${email}:${Date.now()}`;
	const signature = sign(payload, getSecret());
	return `${payload}.${signature}`;
}

export function validateSession(cookie: string): boolean {
	const lastDot = cookie.lastIndexOf(".");
	if (lastDot === -1) return false;

	const payload = cookie.slice(0, lastDot);
	const signature = cookie.slice(lastDot + 1);

	const expected = sign(payload, getSecret());

	if (signature.length !== expected.length) return false;

	return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
