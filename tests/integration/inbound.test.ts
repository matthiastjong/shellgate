import { beforeEach, describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { db } from "$lib/server/db";
import { tokens, inboundEvents } from "$lib/server/db/schema";
import { eq } from "drizzle-orm";
import {
	enableWebhook,
	createInboundEvent,
	ackEvent,
	getPendingEvents,
	verifySignature,
	generateWebhookKey,
	generateEventId,
} from "$lib/server/services/inbound";
import { checkRateLimit } from "$lib/server/inbound-ratelimit";
import { createTestToken, truncateAll } from "../helpers";

async function enableWebhookForToken(tokenId: string) {
	return enableWebhook(tokenId);
}

describe("inbound webhook buffer", () => {
	beforeEach(async () => {
		await truncateAll();
		// Also clear inbound events (cascade should handle it, but just in case)
		await db.delete(inboundEvents);
	});

	// --- Key generation ---
	it("generateWebhookKey produces whk_ prefix", () => {
		const key = generateWebhookKey();
		expect(key).toMatch(/^whk_[a-f0-9]{48}$/);
	});

	it("generateEventId produces evt_ prefix", () => {
		const id = generateEventId();
		expect(id).toMatch(/^evt_[a-f0-9]{16}$/);
	});

	// --- Signature verification ---
	describe("verifySignature", () => {
		it("accepts valid sha256= prefixed signature", () => {
			const secret = "my-secret";
			const body = '{"action":"created"}';
			const sig = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
			expect(verifySignature(body, sig, secret)).toBe(true);
		});

		it("accepts valid plain hex signature", () => {
			const secret = "my-secret";
			const body = '{"action":"created"}';
			const sig = createHmac("sha256", secret).update(body).digest("hex");
			expect(verifySignature(body, sig, secret)).toBe(true);
		});

		it("rejects invalid signature", () => {
			expect(verifySignature('{"a":1}', "sha256=deadbeef", "secret")).toBe(false);
		});

		it("rejects mismatched length signatures without throwing", () => {
			expect(verifySignature("body", "short", "secret")).toBe(false);
		});
	});

	// --- Rate limiter ---
	describe("checkRateLimit", () => {
		it("allows requests under limit", () => {
			const key = `test-rl-${Date.now()}`;
			for (let i = 0; i < 100; i++) {
				expect(checkRateLimit(key)).toBe(true);
			}
		});

		it("blocks 101st request", () => {
			const key = `test-rl-block-${Date.now()}`;
			for (let i = 0; i < 100; i++) {
				checkRateLimit(key);
			}
			expect(checkRateLimit(key)).toBe(false);
		});
	});

	// --- Service functions ---
	describe("enableWebhook / disableWebhook", () => {
		it("assigns a webhook key to a token", async () => {
			const { token } = await createTestToken();
			const result = await enableWebhook(token.id);
			expect(result).not.toBeNull();
			expect(result!.webhookKey).toMatch(/^whk_/);

			const [row] = await db.select({ webhookKey: tokens.webhookKey }).from(tokens).where(eq(tokens.id, token.id)).limit(1);
			expect(row.webhookKey).toMatch(/^whk_/);
		});
	});

	describe("createInboundEvent", () => {
		it("stores an event and returns an id", async () => {
			const { token } = await createTestToken();
			await enableWebhook(token.id);

			const event = await createInboundEvent({
				tokenId: token.id,
				channel: "linear",
				payload: { action: "created" },
				headers: { "x-linear-event": "Issue" },
				sourceIp: "1.2.3.4",
				eventType: "Issue",
			});

			expect(event.id).toMatch(/^evt_/);
		});
	});

	describe("getPendingEvents", () => {
		it("returns pending events for the token", async () => {
			const { token } = await createTestToken();
			await createInboundEvent({
				tokenId: token.id,
				channel: "linear",
				payload: { x: 1 },
				headers: {},
				sourceIp: null,
				eventType: null,
			});

			const events = await getPendingEvents(token.id);
			expect(events).toHaveLength(1);
			expect(events[0].status).toBe("pending");
		});

		it("filters by channel", async () => {
			const { token } = await createTestToken();
			await createInboundEvent({ tokenId: token.id, channel: "linear", payload: {}, headers: {}, sourceIp: null, eventType: null });
			await createInboundEvent({ tokenId: token.id, channel: "github", payload: {}, headers: {}, sourceIp: null, eventType: null });

			const linear = await getPendingEvents(token.id, "linear");
			expect(linear).toHaveLength(1);
			expect(linear[0].channel).toBe("linear");
		});

		it("does not return events from another token", async () => {
			const { token: t1 } = await createTestToken();
			const { token: t2 } = await createTestToken();
			await createInboundEvent({ tokenId: t1.id, channel: "linear", payload: {}, headers: {}, sourceIp: null, eventType: null });

			const events = await getPendingEvents(t2.id);
			expect(events).toHaveLength(0);
		});
	});

	describe("ackEvent", () => {
		it("acks an event", async () => {
			const { token } = await createTestToken();
			const event = await createInboundEvent({ tokenId: token.id, channel: "c", payload: {}, headers: {}, sourceIp: null, eventType: null });

			const result = await ackEvent(event.id, token.id);
			expect(result).not.toBeNull();
			expect(result!.id).toBe(event.id);

			const events = await getPendingEvents(token.id);
			expect(events).toHaveLength(0);
		});

		it("returns null when acking already-acked event", async () => {
			const { token } = await createTestToken();
			const event = await createInboundEvent({ tokenId: token.id, channel: "c", payload: {}, headers: {}, sourceIp: null, eventType: null });

			await ackEvent(event.id, token.id);
			const result = await ackEvent(event.id, token.id);
			expect(result).toBeNull();
		});

		it("cannot ack another token's event", async () => {
			const { token: t1 } = await createTestToken();
			const { token: t2 } = await createTestToken();
			const event = await createInboundEvent({ tokenId: t1.id, channel: "c", payload: {}, headers: {}, sourceIp: null, eventType: null });

			const result = await ackEvent(event.id, t2.id);
			expect(result).toBeNull();
		});
	});
});
