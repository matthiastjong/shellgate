import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { proxyRequest } from "$lib/server/services/gateway";
import { connectAccount, updateAccountStatus, getManagedTargets } from "$lib/server/services/connected-accounts";
import { db } from "$lib/server/db";
import { tokens } from "$lib/server/db/schema";
import { eq } from "drizzle-orm";
import type { Token } from "$lib/server/db/schema";
import {
	createTestToken,
	createTestProvider,
	grantPermission,
	truncateAll,
} from "../helpers";

async function getFullToken(tokenId: string): Promise<Token> {
	const [row] = await db.select().from(tokens).where(eq(tokens.id, tokenId)).limit(1);
	return row;
}

describe("gateway — managed targets", () => {
	let originalFetch: typeof globalThis.fetch;

	beforeEach(async () => {
		await truncateAll();
		originalFetch = globalThis.fetch;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("injects access token from connected account for managed targets", async () => {
		const provider = await createTestProvider("Microsoft 365");
		const account = await connectAccount({
			providerId: provider.id,
			email: "user@example.com",
			displayName: "Test User",
			accessToken: "managed-access-token-xyz",
			refreshToken: "managed-refresh-token-xyz",
			tokenExpiresAt: new Date(Date.now() + 3600_000), // 1 hour from now
		});

		// Find the managed mail target created by connectAccount
		const managedTargets = await getManagedTargets(account.id);
		const mailTarget = managedTargets.find((t) => t.slug?.includes("mail"));
		expect(mailTarget).toBeDefined();

		// Create a token and grant access to the managed target
		const { token: tokenRow } = await createTestToken();
		await grantPermission(tokenRow.id, mailTarget!.id);
		const fullToken = await getFullToken(tokenRow.id);

		// Mock fetch to capture upstream request
		let capturedHeaders: Headers | undefined;
		globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
			capturedHeaders = new Headers(init?.headers);
			return Response.json({ value: [] });
		};

		const request = new Request(`http://localhost/gateway/${mailTarget!.slug}/me/messages`, {
			method: "GET",
		});

		const response = await proxyRequest(fullToken, mailTarget!.slug, "me/messages", request);

		expect(response.status).toBe(200);
		expect(capturedHeaders).toBeDefined();
		expect(capturedHeaders!.get("Authorization")).toBe("Bearer managed-access-token-xyz");
	});

	it("returns 503 when connected account is disconnected", async () => {
		const provider = await createTestProvider("Microsoft 365");
		const account = await connectAccount({
			providerId: provider.id,
			email: "disconnected@example.com",
			displayName: "Disconnected User",
			accessToken: "old-token",
			refreshToken: "old-refresh",
			tokenExpiresAt: new Date(Date.now() + 3600_000),
		});

		// Mark account as disconnected
		await updateAccountStatus(account.id, "disconnected", "Token revoked");

		// Find the managed mail target
		const managedTargets = await getManagedTargets(account.id);
		const mailTarget = managedTargets.find((t) => t.slug?.includes("mail"));
		expect(mailTarget).toBeDefined();

		// Create a token and grant access
		const { token: tokenRow } = await createTestToken();
		await grantPermission(tokenRow.id, mailTarget!.id);
		const fullToken = await getFullToken(tokenRow.id);

		const request = new Request(`http://localhost/gateway/${mailTarget!.slug}/me/messages`, {
			method: "GET",
		});

		const response = await proxyRequest(fullToken, mailTarget!.slug, "me/messages", request);

		expect(response.status).toBe(503);
		const body = await response.json();
		expect(body.error).toContain("disconnected");
		expect(body.error).toContain("Token revoked");
	});
});
