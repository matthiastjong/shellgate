import { handleCreateTarget, handleAddAuthMethod, handleCreateKey, loadTargets } from "$lib/server/actions/connect-actions";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async () => ({ targets: await loadTargets() });

export const actions = {
	createTarget: async ({ request }) => handleCreateTarget(request),
	addAuthMethod: async ({ request }) => handleAddAuthMethod(request),
	createKey: async ({ request }) => handleCreateKey(request),
} satisfies Actions;
