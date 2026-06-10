import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { proxyRequest } from "$lib/server/services/gateway";
import { connectAccount, updateAccountStatus, getManagedTargets } from "$lib/server/services/connected-accounts";
import { db } from "$lib/server/db";
import { tokens } from "$lib/server/db/schema";
import { eq } from "drizzle-orm";
import type { Token } from "$lib/server/db/schema";
import {
	createTestToken,
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
		const account = await connectAccount({
			providerType: "microsoft_365",
			email: "user@example.com",
			displayName: "Test User",
			accessToken: "managed-access-token-xyz",
			refreshToken: "managed-refresh-token-xyz",
			tokenExpiresAt: new Date(Date.now() + 3600_000),
		});

		const managedTargets = await getManagedTargets(account.id);
		const mailTarget = managedTargets.find((t) => t.slug?.includes("mail"));
		expect(mailTarget).toBeDefined();

		const { token: tokenRow } = await createTestToken();
		await grantPermission(tokenRow.id, mailTarget!.id);
		const fullToken = await getFullToken(tokenRow.id);

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
		const account = await connectAccount({
			providerType: "microsoft_365",
			email: "disconnected@example.com",
			displayName: "Disconnected User",
			accessToken: "old-token",
			refreshToken: "old-refresh",
			tokenExpiresAt: new Date(Date.now() + 3600_000),
		});

		await updateAccountStatus(account.id, "disconnected", "Token revoked");

		const managedTargets = await getManagedTargets(account.id);
		const mailTarget = managedTargets.find((t) => t.slug?.includes("mail"));
		expect(mailTarget).toBeDefined();

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
