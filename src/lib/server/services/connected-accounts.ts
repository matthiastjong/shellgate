import { eq } from "drizzle-orm";
import { db } from "../db";
import { connectedAccounts, integrationProviders, targets } from "../db/schema";

function slugify(name: string): string {
	return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export async function connectAccount(input: {
	providerId: string;
	email: string;
	displayName?: string;
	accessToken: string;
	refreshToken: string;
	tokenExpiresAt: Date;
}) {
	// Look up the provider
	const [provider] = await db
		.select()
		.from(integrationProviders)
		.where(eq(integrationProviders.id, input.providerId))
		.limit(1);

	if (!provider) throw new Error("Provider not found");

	// Insert the connected account
	const [account] = await db
		.insert(connectedAccounts)
		.values({
			providerId: input.providerId,
			email: input.email,
			displayName: input.displayName,
			accessToken: input.accessToken,
			refreshToken: input.refreshToken,
			tokenExpiresAt: input.tokenExpiresAt,
		})
		.returning();

	// Create 2 managed API targets
	const emailSlug = `${slugify(input.email)}-mail`;
	const calendarSlug = `${slugify(input.email)}-calendar`;

	await db.insert(targets).values([
		{
			name: `${input.email} — Mail`,
			slug: emailSlug,
			type: "api" as const,
			baseUrl: "https://graph.microsoft.com/v1.0",
			connectedAccountId: account.id,
			capability: "mail" as const,
		},
		{
			name: `${input.email} — Calendar`,
			slug: calendarSlug,
			type: "api" as const,
			baseUrl: "https://graph.microsoft.com/v1.0",
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
		.select({
			id: connectedAccounts.id,
			email: connectedAccounts.email,
			displayName: connectedAccounts.displayName,
			status: connectedAccounts.status,
			statusMessage: connectedAccounts.statusMessage,
			createdAt: connectedAccounts.createdAt,
			provider: {
				id: integrationProviders.id,
				name: integrationProviders.name,
				type: integrationProviders.type,
				slug: integrationProviders.slug,
			},
		})
		.from(connectedAccounts)
		.innerJoin(
			integrationProviders,
			eq(connectedAccounts.providerId, integrationProviders.id),
		);

	return rows;
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
	const now = Date.now();
	const expiresAt = new Date(account.tokenExpiresAt).getTime();
	if (expiresAt > now + 60_000) {
		return account.accessToken;
	}

	// Need to refresh — look up provider for tokenUrl and clientId/secret
	const [provider] = await db
		.select()
		.from(integrationProviders)
		.where(eq(integrationProviders.id, account.providerId))
		.limit(1);

	if (!provider) throw new Error("Provider not found");

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

		const newExpiresAt = new Date(Date.now() + data.expires_in * 1000);

		const updates: Record<string, unknown> = {
			accessToken: data.access_token,
			tokenExpiresAt: newExpiresAt,
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
		// If it's already our thrown error from the !response.ok branch, re-throw
		if (error instanceof Error && error.message.startsWith("Token refresh failed")) {
			throw error;
		}
		// Network or unexpected error
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
