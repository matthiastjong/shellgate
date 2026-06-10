import { fail } from "@sveltejs/kit";
import { listAccounts, disconnectAccount, getManagedTargets } from "$lib/server/services/connected-accounts";
import { getEnabledProviders } from "$lib/server/providers";
import { listTokens } from "$lib/server/services/tokens";
import { addPermission, removePermission, hasPermission } from "$lib/server/services/permissions";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async () => {
	const accounts = await listAccounts();
	const providers = getEnabledProviders();
	const allTokens = await listTokens();
	const activeTokens = allTokens.filter((t) => !t.revokedAt);

	const accountsWithTargets = await Promise.all(
		accounts.map(async (account) => {
			const managedTargets = await getManagedTargets(account.id);

			// For each token, check if it has access to ALL managed targets of this account
			const tokenAccess = await Promise.all(
				activeTokens.map(async (token) => {
					const perms = await Promise.all(
						managedTargets.map((t) => hasPermission(token.id, t.id)),
					);
					return {
						tokenId: token.id,
						tokenName: token.name,
						hasAccess: perms.length > 0 && perms.every(Boolean),
					};
				}),
			);

			return { ...account, managedTargets, tokenAccess };
		}),
	);

	return { accounts: accountsWithTargets, providers };
};

export const actions = {
	disconnect: async ({ request }) => {
		const form = await request.formData();
		const accountId = form.get("accountId") as string;
		if (!accountId) return fail(400, { error: "Account ID required" });

		await disconnectAccount(accountId);
		return { success: true };
	},

	grantAccess: async ({ request }) => {
		const form = await request.formData();
		const accountId = form.get("accountId") as string;
		const tokenId = form.get("tokenId") as string;
		if (!accountId || !tokenId) return fail(400, { error: "Account ID and Token ID required" });

		const managedTargets = await getManagedTargets(accountId);
		for (const target of managedTargets) {
			try {
				await addPermission(tokenId, target.id);
			} catch {
				// Already has permission — skip
			}
		}

		return { success: true };
	},

	revokeAccess: async ({ request }) => {
		const form = await request.formData();
		const accountId = form.get("accountId") as string;
		const tokenId = form.get("tokenId") as string;
		if (!accountId || !tokenId) return fail(400, { error: "Account ID and Token ID required" });

		const managedTargets = await getManagedTargets(accountId);
		for (const target of managedTargets) {
			await removePermission(tokenId, target.id);
		}

		return { success: true };
	},
} satisfies Actions;
