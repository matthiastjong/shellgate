import { createHmac, timingSafeEqual } from "node:crypto";

export function verifySignature(secret: string, body: string, signature: string): boolean {
	const expected = createHmac("sha256", secret).update(body).digest("hex");
	const cleaned = signature.replace(/^sha256=/, "");
	if (cleaned.length !== expected.length) return false;
	return timingSafeEqual(Buffer.from(cleaned, "hex"), Buffer.from(expected, "hex"));
}
