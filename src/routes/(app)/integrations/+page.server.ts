import { fail } from "@sveltejs/kit";
import { listAccounts, disconnectAccount, getManagedTargets } from "$lib/server/services/connected-accounts";
import { getEnabledProviders } from "$lib/server/services/integration-providers";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async () => {
	const accounts = await listAccounts();
	const providers = await getEnabledProviders();

	const accountsWithTargets = await Promise.all(
		accounts.map(async (account) => {
			const managedTargets = await getManagedTargets(account.id);
			return { ...account, managedTargets };
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
} satisfies Actions;
