import { createHmac, timingSafeEqual } from "node:crypto";

function sign(payload: string, secret: string): string {
	return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createSession(email: string, adminPassword: string): string {
	const payload = `${email}:${Date.now()}`;
	const signature = sign(payload, adminPassword);
	return `${payload}.${signature}`;
}

export function validateSession(
	cookie: string,
	adminPassword: string,
): boolean {
	const lastDot = cookie.lastIndexOf(".");
	if (lastDot === -1) return false;

	const payload = cookie.slice(0, lastDot);
	const signature = cookie.slice(lastDot + 1);

	const expected = sign(payload, adminPassword);

	if (signature.length !== expected.length) return false;

	return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
