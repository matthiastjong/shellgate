import { redirect } from "@sveltejs/kit";
import { listTokens } from "$lib/server/services/tokens";
import { resetHasTokensCache } from "$lib/server/cache";
import { handleCreateTarget, handleCreateKey, loadTargets } from "$lib/server/actions/connect-actions";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async () => {
	const tokens = await listTokens();
	if (tokens.length > 0) redirect(303, "/");
	return { targets: await loadTargets() };
};

export const actions = {
	createTarget: async ({ request }) => handleCreateTarget(request),
	createKey: async ({ request }) => {
		const result = await handleCreateKey(request);
		resetHasTokensCache();
		return result;
	},
} satisfies Actions;
