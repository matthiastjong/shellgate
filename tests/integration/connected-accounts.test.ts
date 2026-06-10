import { describe, it, expect, beforeEach } from "vitest";
import { truncateAll } from "../helpers";
import {
	connectAccount,
	disconnectAccount,
	listAccounts,
	getAccessTokenForAccount,
	getManagedTargets,
	getAccountById,
	updateAccountStatus,
} from "$lib/server/services/connected-accounts";
import { updateTarget, deleteTarget } from "$lib/server/services/targets";
import { addPermission, hasPermission } from "$lib/server/services/permissions";
import { createTestToken } from "../helpers";

function connectTestAccount(overrides: { email?: string } = {}) {
	return connectAccount({
		providerType: "microsoft_365",
		email: overrides.email ?? "test@example.com",
		displayName: "Test User",
		accessToken: "at-123",
		refreshToken: "rt-456",
		tokenExpiresAt: new Date(Date.now() + 3600_000),
	});
}

describe("connected accounts service", () => {
	beforeEach(async () => {
		await truncateAll();
	});

	it("provisions 2 managed targets when connecting", async () => {
		const account = await connectTestAccount({ email: "matthias@deal.nl" });

		expect(account.id).toBeDefined();
		expect(account.email).toBe("matthias@deal.nl");
		expect(account.status).toBe("connected");
		expect(account.providerType).toBe("microsoft_365");

		const managed = await getManagedTargets(account.id);
		expect(managed).toHaveLength(2);

		const mailTarget = managed.find((t) => t.capability === "mail");
		const calTarget = managed.find((t) => t.capability === "calendar");

		expect(mailTarget).toBeDefined();
		expect(mailTarget!.type).toBe("api");
		expect(mailTarget!.baseUrl).toBe("https://graph.microsoft.com/v1.0");
		expect(mailTarget!.slug).toBe("matthias-deal-nl-mail");
		expect(mailTarget!.connectedAccountId).toBe(account.id);

		expect(calTarget).toBeDefined();
		expect(calTarget!.type).toBe("api");
		expect(calTarget!.baseUrl).toBe("https://graph.microsoft.com/v1.0");
		expect(calTarget!.slug).toBe("matthias-deal-nl-calendar");
		expect(calTarget!.connectedAccountId).toBe(account.id);
	});

	it("cascade deletes managed targets when disconnecting", async () => {
		const account = await connectTestAccount();

		const before = await getManagedTargets(account.id);
		expect(before).toHaveLength(2);

		await disconnectAccount(account.id);

		const after = await getManagedTargets(account.id);
		expect(after).toHaveLength(0);
	});

	it("lists accounts with provider info", async () => {
		await connectTestAccount({ email: "user@example.com" });

		const accounts = await listAccounts();
		expect(accounts).toHaveLength(1);

		const acc = accounts[0];
		expect(acc.email).toBe("user@example.com");
		expect(acc.provider.type).toBe("microsoft_365");
		expect(acc.provider.name).toBe("Microsoft 365");
	});

	it("returns cached token when not expired", async () => {
		const account = await connectTestAccount();

		const token = await getAccessTokenForAccount(account.id);
		expect(token).toBe("at-123");
	});

	it("refreshes access token when expired", async () => {
		const account = await connectAccount({
			providerType: "microsoft_365",
			email: "expired@example.com",
			accessToken: "old-token",
			refreshToken: "rt-refresh",
			tokenExpiresAt: new Date(Date.now() - 60_000), // expired
		});

		const originalFetch = globalThis.fetch;
		try {
			globalThis.fetch = async (url: string | URL | Request) => {
				const urlStr = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
				if (urlStr.includes("oauth2/v2.0/token")) {
					return Response.json({
						access_token: "new-access-token",
						refresh_token: "new-refresh-token",
						expires_in: 3600,
					});
				}
				return originalFetch(url);
			};

			const token = await getAccessTokenForAccount(account.id);
			expect(token).toBe("new-access-token");
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	it("sets status to disconnected on refresh failure", async () => {
		const account = await connectAccount({
			providerType: "microsoft_365",
			email: "fail@example.com",
			accessToken: "old-token",
			refreshToken: "bad-rt",
			tokenExpiresAt: new Date(Date.now() - 60_000), // expired
		});

		const originalFetch = globalThis.fetch;
		try {
			globalThis.fetch = async (url: string | URL | Request) => {
				const urlStr = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
				if (urlStr.includes("oauth2/v2.0/token")) {
					return new Response("invalid_grant", { status: 400 });
				}
				return originalFetch(url);
			};

			await expect(getAccessTokenForAccount(account.id)).rejects.toThrow(
				"Token refresh failed: 400",
			);

			const updated = await getAccountById(account.id);
			expect(updated!.status).toBe("disconnected");
			expect(updated!.statusMessage).toContain("Token refresh failed");
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	it("rejects updates to managed target details", async () => {
		const account = await connectTestAccount({ email: "managed@example.com" });

		const managed = await getManagedTargets(account.id);
		expect(managed.length).toBeGreaterThan(0);

		const target = managed[0];
		const result = await updateTarget(target.id, { name: "hacked" });

		expect(result).toEqual({
			error: "cannot modify a managed target — changes must be made via the connected account",
		});
	});

	it("rejects deletion of managed targets", async () => {
		const account = await connectTestAccount({ email: "nodelete@example.com" });

		const managed = await getManagedTargets(account.id);
		expect(managed.length).toBeGreaterThan(0);

		const target = managed[0];
		const result = await deleteTarget(target.id);

		expect(result).toEqual({
			error: "cannot delete a managed target — disconnect the account instead",
		});
	});

	it("allows permission changes on managed targets", async () => {
		const account = await connectTestAccount({ email: "perms@example.com" });

		const managed = await getManagedTargets(account.id);
		expect(managed.length).toBeGreaterThan(0);

		const target = managed[0];
		const { token } = await createTestToken();

		await addPermission(token.id, target.id);
		const allowed = await hasPermission(token.id, target.id);
		expect(allowed).toBe(true);
	});
});
