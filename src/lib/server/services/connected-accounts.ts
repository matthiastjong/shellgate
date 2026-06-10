import { eq } from "drizzle-orm";
import { db } from "../db";
import { connectedAccounts, targets } from "../db/schema";
import { getProvider } from "../providers";

function slugify(name: string): string {
	return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export async function connectAccount(input: {
	providerType: string;
	email: string;
	displayName?: string;
	accessToken: string;
	refreshToken: string;
	tokenExpiresAt: Date;
}) {
	const provider = getProvider(input.providerType);
	if (!provider) throw new Error(`Unknown or unconfigured provider: ${input.providerType}`);

	// Insert the connected account
	const [account] = await db
		.insert(connectedAccounts)
		.values({
			providerType: input.providerType,
			email: input.email,
			displayName: input.displayName,
			accessToken: input.accessToken,
			refreshToken: input.refreshToken,
			tokenExpiresAt: input.tokenExpiresAt,
		})
		.returning();

	// Create 2 managed API targets — append short ID suffix to avoid slug collisions on reconnect
	const emailSlug = slugify(input.email);
	const suffix = account.id.slice(0, 6);

	await db.insert(targets).values([
		{
			name: `${input.email} — Mail`,
			slug: `${emailSlug}-mail-${suffix}`,
			type: "api" as const,
			baseUrl: provider.graphBaseUrl,
			connectedAccountId: account.id,
			capability: "mail" as const,
		},
		{
			name: `${input.email} — Calendar`,
			slug: `${emailSlug}-calendar-${suffix}`,
			type: "api" as const,
			baseUrl: provider.graphBaseUrl,
			connectedAccountId: account.id,
			capability: "calendar" as const,
		},
	]);

	return account;
}

export async function disconnectAccount(accountId: string) {
	const [row] = await db
		.delete(connectedAccounts)
		.where(eq(connectedAccounts.id, accountId))
		.returning();

	return row ?? null;
}

export async function getAccountById(accountId: string) {
	const [row] = await db
		.select()
		.from(connectedAccounts)
		.where(eq(connectedAccounts.id, accountId))
		.limit(1);

	return row ?? null;
}

export async function listAccounts() {
	const rows = await db
		.select()
		.from(connectedAccounts)
		.orderBy(connectedAccounts.createdAt);

	return rows.map((row) => {
		const provider = getProvider(row.providerType);
		return {
			...row,
			provider: {
				type: row.providerType,
				name: provider?.name ?? row.providerType,
			},
		};
	});
}

export async function getManagedTargets(accountId: string) {
	return db
		.select()
		.from(targets)
		.where(eq(targets.connectedAccountId, accountId));
}

export async function getAccessTokenForAccount(accountId: string) {
	const account = await getAccountById(accountId);
	if (!account) throw new Error("Account not found");

	// Check if token is still valid (with 60s buffer)
	const expiresAt = new Date(account.tokenExpiresAt).getTime();
	if (expiresAt > Date.now() + 60_000) {
		return account.accessToken;
	}

	// Need to refresh — get provider config from static registry
	const provider = getProvider(account.providerType);
	if (!provider) throw new Error(`Provider not configured: ${account.providerType}`);

	try {
		const response = await fetch(provider.tokenUrl, {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				client_id: provider.clientId,
				client_secret: provider.clientSecret,
				refresh_token: account.refreshToken,
				grant_type: "refresh_token",
			}),
		});

		if (!response.ok) {
			const errorText = await response.text();
			await updateAccountStatus(accountId, "disconnected", `Token refresh failed: ${response.status} ${errorText}`);
			throw new Error(`Token refresh failed: ${response.status}`);
		}

		const data = await response.json();

		const updates: Record<string, unknown> = {
			accessToken: data.access_token,
			tokenExpiresAt: new Date(Date.now() + data.expires_in * 1000),
			status: "connected",
			statusMessage: null,
			updatedAt: new Date(),
		};

		if (data.refresh_token) {
			updates.refreshToken = data.refresh_token;
		}

		await db
			.update(connectedAccounts)
			.set(updates)
			.where(eq(connectedAccounts.id, accountId));

		return data.access_token as string;
	} catch (error) {
		if (error instanceof Error && error.message.startsWith("Token refresh failed")) {
			throw error;
		}
		await updateAccountStatus(accountId, "disconnected", `Token refresh error: ${error instanceof Error ? error.message : String(error)}`);
		throw error;
	}
}

export async function updateAccountStatus(
	accountId: string,
	status: "connected" | "disconnected" | "error",
	message?: string,
) {
	const [row] = await db
		.update(connectedAccounts)
		.set({
			status,
			statusMessage: message ?? null,
			updatedAt: new Date(),
		})
		.where(eq(connectedAccounts.id, accountId))
		.returning();

	return row ?? null;
}
