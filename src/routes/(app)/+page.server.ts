import { listTargets } from "$lib/server/services/targets";
import { listTokens } from "$lib/server/services/tokens";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async () => {
	const [targets, tokens] = await Promise.all([listTargets(), listTokens()]);

	const totalAuthMethods = targets.reduce(
		(sum, t) => sum + (t.authMethodCount ?? 0),
		0,
	);

	return {
		stats: {
			totalTargets: targets.length,
			activeTargets: targets.filter((t) => t.enabled !== false).length,
			totalApiKeys: tokens.length,
			activeApiKeys: tokens.filter((t) => !t.revokedAt).length,
			revokedApiKeys: tokens.filter((t) => t.revokedAt).length,
			totalAuthMethods,
		},
	};
};
