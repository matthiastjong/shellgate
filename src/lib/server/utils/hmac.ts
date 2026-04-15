import { createHmac, timingSafeEqual } from "node:crypto";

export function verifySignature(secret: string, body: string, signature: string): boolean {
	// Try HMAC verification first (GitHub-style: sha256=<hex>)
	const cleaned = signature.replace(/^sha256=/, "");
	if (/^[0-9a-f]{64}$/i.test(cleaned)) {
		const expected = createHmac("sha256", secret).update(body).digest("hex");
		return timingSafeEqual(Buffer.from(cleaned, "hex"), Buffer.from(expected, "hex"));
	}

	// Fall back to direct token comparison (GitLab-style: X-Gitlab-Token)
	const sigBuf = Buffer.from(signature);
	const secretBuf = Buffer.from(secret);
	if (sigBuf.length !== secretBuf.length) return false;
	return timingSafeEqual(sigBuf, secretBuf);
}
