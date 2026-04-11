import { beforeEach, describe, expect, it } from "vitest";
import {
	createEndpoint,
	listEndpoints,
	getEndpoint,
	getEndpointBySlug,
	deleteEndpoint,
} from "$lib/server/services/webhook-endpoints";
import { createTestToken, truncateAll } from "../helpers";

describe("webhook-endpoints service", () => {
	beforeEach(async () => {
		await truncateAll();
	});

	it("creates an endpoint with auto-generated slug", async () => {
		const { token } = await createTestToken();
		const endpoint = await createEndpoint(token.id, { name: "Linear webhook" });

		expect(endpoint.id).toBeDefined();
		expect(endpoint.name).toBe("Linear webhook");
		expect(endpoint.slug).toMatch(/^wh_[a-f0-9]{48}$/);
		expect(endpoint.tokenId).toBe(token.id);
		expect(endpoint.enabled).toBe(true);
		expect(endpoint.secret).toBeNull();
		expect(endpoint.signatureHeader).toBeNull();
	});

	it("creates an endpoint with secret and signature header", async () => {
		const { token } = await createTestToken();
		const endpoint = await createEndpoint(token.id, {
			name: "GitHub webhook",
			secret: "gh-secret-123",
			signatureHeader: "X-Hub-Signature-256",
		});

		expect(endpoint.secret).toBe("gh-secret-123");
		expect(endpoint.signatureHeader).toBe("X-Hub-Signature-256");
	});

	it("lists endpoints filtered by tokenId", async () => {
		const { token: token1 } = await createTestToken("Agent A");
		const { token: token2 } = await createTestToken("Agent B");
		await createEndpoint(token1.id, { name: "WH 1" });
		await createEndpoint(token1.id, { name: "WH 2" });
		await createEndpoint(token2.id, { name: "WH 3" });

		const all = await listEndpoints();
		expect(all).toHaveLength(3);

		const filtered = await listEndpoints(token1.id);
		expect(filtered).toHaveLength(2);
		expect(filtered.every((e) => e.tokenId === token1.id)).toBe(true);
	});

	it("gets endpoint by id", async () => {
		const { token } = await createTestToken();
		const created = await createEndpoint(token.id, { name: "Test" });
		const fetched = await getEndpoint(created.id);

		expect(fetched).not.toBeNull();
		expect(fetched!.id).toBe(created.id);
	});

	it("gets endpoint by slug", async () => {
		const { token } = await createTestToken();
		const created = await createEndpoint(token.id, { name: "Test" });
		const fetched = await getEndpointBySlug(created.slug);

		expect(fetched).not.toBeNull();
		expect(fetched!.id).toBe(created.id);
	});

	it("returns null for non-existent endpoint", async () => {
		const fetched = await getEndpoint("00000000-0000-0000-0000-000000000000");
		expect(fetched).toBeNull();
	});

	it("deletes endpoint", async () => {
		const { token } = await createTestToken();
		const created = await createEndpoint(token.id, { name: "Test" });
		await deleteEndpoint(created.id);
		const fetched = await getEndpoint(created.id);
		expect(fetched).toBeNull();
	});

	it("cascade deletes endpoints when token is deleted", async () => {
		const { token } = await createTestToken();
		await createEndpoint(token.id, { name: "WH 1" });
		await createEndpoint(token.id, { name: "WH 2" });

		const { db } = await import("$lib/server/db");
		const { tokens } = await import("$lib/server/db/schema");
		const { eq } = await import("drizzle-orm");
		await db.delete(tokens).where(eq(tokens.id, token.id));

		const remaining = await listEndpoints();
		expect(remaining).toHaveLength(0);
	});
});
