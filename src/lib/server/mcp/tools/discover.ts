import { listPermissions } from "$lib/server/services/permissions";
import { getTargetById } from "$lib/server/services/targets";
import { listEndpoints } from "$lib/server/services/webhook-endpoints";
import { listSkills } from "$lib/server/services/skills";
import { countMemories } from "$lib/server/services/memories";
import { countWikiPages } from "$lib/server/services/wiki";
import { listVaultPermissions } from "$lib/server/services/vault-permissions";
import type { Token } from "$lib/server/db/schema";

export async function discover(token: Token) {
	const permissions = await listPermissions(token.id);

	const targets = (
		await Promise.all(
			permissions.map(async (p) => {
				const target = await getTargetById(p.targetId);
				if (!target || !target.enabled) return null;
				return {
					slug: target.slug,
					name: target.name,
					type: target.type,
					...(target.type === "api" && {
						proxy: `/gateway/${target.slug}`,
						baseUrl: target.baseUrl,
					}),
				};
			})
		)
	).filter(Boolean);

	const webhookEndpoints = await listEndpoints(token.id);
	const webhooks = webhookEndpoints
		.filter((ep) => ep.enabled)
		.map((ep) => ({
			name: ep.name,
			poll: "/webhooks/poll",
			ack: "/webhooks/ack",
		}));

	const skills = await listSkills();

	const resolvedUser = token.defaultUser ?? null;
	const memoryCount = await countMemories(token.id, resolvedUser);
	const wikiPageCount = await countWikiPages();

	const vaultPerms = await listVaultPermissions(token.id);
	const vaultCount = vaultPerms.length;
	const vaults = vaultPerms.map((p) => ({ name: p.vault.name, slug: p.vault.slug }));

	return { targets, webhooks, skills, memoryCount, wikiPageCount, vaultCount, vaults };
}
