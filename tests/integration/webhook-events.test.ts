import { beforeEach, describe, expect, it } from "vitest";
import {
	createEvent,
	getPendingEvents,
	acknowledgeEvents,
	cleanupExpiredEvents,
} from "$lib/server/services/webhook-events";
import { createEndpoint } from "$lib/server/services/webhook-endpoints";
import { createTestToken, truncateAll } from "../helpers";
import { db } from "$lib/server/db";
import { webhookEvents } from "$lib/server/db/schema";
import { eq } from "drizzle-orm";

describe("webhook-events service", () => {
	beforeEach(async () => {
		await truncateAll();
	});

	it("creates a pending event with 7-day expiry", async () => {
		const { token } = await createTestToken();
		const endpoint = await createEndpoint(token.id, { name: "Test" });
		const event = await createEvent(endpoint.id, { "content-type": "application/json" }, { action: "create" });

		expect(event.id).toBeDefined();
		expect(event.status).toBe("pending");
		expect(event.endpointId).toBe(endpoint.id);
		expect(event.body).toEqual({ action: "create" });
		expect(event.deliveredAt).toBeNull();

		const expiresAt = new Date(event.expiresAt);
		const receivedAt = new Date(event.receivedAt);
		const diffDays = (expiresAt.getTime() - receivedAt.getTime()) / (1000 * 60 * 60 * 24);
		expect(diffDays).toBeCloseTo(7, 0);
	});

	it("returns pending events for a token across all endpoints", async () => {
		const { token } = await createTestToken();
		const ep1 = await createEndpoint(token.id, { name: "Linear" });
		const ep2 = await createEndpoint(token.id, { name: "GitHub" });
		await createEvent(ep1.id, {}, { source: "linear" });
		await createEvent(ep2.id, {}, { source: "github" });

		const events = await getPendingEvents(token.id);
		expect(events).toHaveLength(2);
	});

	it("returns pending events filtered by endpointId", async () => {
		const { token } = await createTestToken();
		const ep1 = await createEndpoint(token.id, { name: "Linear" });
		const ep2 = await createEndpoint(token.id, { name: "GitHub" });
		await createEvent(ep1.id, {}, { source: "linear" });
		await createEvent(ep2.id, {}, { source: "github" });

		const events = await getPendingEvents(token.id, ep1.id);
		expect(events).toHaveLength(1);
		expect(events[0].body).toEqual({ source: "linear" });
	});

	it("does not return events belonging to another token", async () => {
		const { token: token1 } = await createTestToken("Agent A");
		const { token: token2 } = await createTestToken("Agent B");
		const ep1 = await createEndpoint(token1.id, { name: "WH1" });
		const ep2 = await createEndpoint(token2.id, { name: "WH2" });
		await createEvent(ep1.id, {}, { for: "agent-a" });
		await createEvent(ep2.id, {}, { for: "agent-b" });

		const events = await getPendingEvents(token1.id);
		expect(events).toHaveLength(1);
		expect(events[0].body).toEqual({ for: "agent-a" });
	});

	it("acknowledges events and sets deliveredAt", async () => {
		const { token } = await createTestToken();
		const endpoint = await createEndpoint(token.id, { name: "Test" });
		const event1 = await createEvent(endpoint.id, {}, { n: 1 });
		const event2 = await createEvent(endpoint.id, {}, { n: 2 });

		const count = await acknowledgeEvents(token.id, [event1.id, event2.id]);
		expect(count).toBe(2);

		const pending = await getPendingEvents(token.id);
		expect(pending).toHaveLength(0);
	});

	it("refuses to acknowledge events belonging to another token", async () => {
		const { token: token1 } = await createTestToken("Agent A");
		const { token: token2 } = await createTestToken("Agent B");
		const ep = await createEndpoint(token1.id, { name: "WH" });
		const event = await createEvent(ep.id, {}, { data: "secret" });

		const count = await acknowledgeEvents(token2.id, [event.id]);
		expect(count).toBe(0);

		const pending = await getPendingEvents(token1.id);
		expect(pending).toHaveLength(1);
	});

	it("includes handlingInstructions in pending events", async () => {
		const { token } = await createTestToken();
		const endpoint = await createEndpoint(token.id, { name: "Test" });

		const { updateInstructions } = await import("$lib/server/services/webhook-endpoints");
		await updateInstructions(endpoint.id, "Send a notification with the link");

		await createEvent(endpoint.id, {}, { action: "create" });
		const events = await getPendingEvents(token.id);

		expect(events[0].handlingInstructions).toBe("Send a notification with the link");
	});

	it("returns null handlingInstructions when not set", async () => {
		const { token } = await createTestToken();
		const endpoint = await createEndpoint(token.id, { name: "Test" });
		await createEvent(endpoint.id, {}, { action: "create" });
		const events = await getPendingEvents(token.id);

		expect(events[0].handlingInstructions).toBeNull();
	});

	it("cleans up expired events", async () => {
		const { token } = await createTestToken();
		const endpoint = await createEndpoint(token.id, { name: "Test" });
		const event = await createEvent(endpoint.id, {}, { old: true });

		// Manually set expiresAt to the past
		await db
			.update(webhookEvents)
			.set({ expiresAt: new Date("2020-01-01") })
			.where(eq(webhookEvents.id, event.id));

		const deleted = await cleanupExpiredEvents();
		expect(deleted).toBe(1);

		const pending = await getPendingEvents(token.id);
		expect(pending).toHaveLength(0);
	});
});
