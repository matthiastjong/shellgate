import type { Token } from "$lib/server/db/schema";
import { listPermissions } from "$lib/server/services/permissions";
import { getTargetById } from "$lib/server/services/targets";
import { listEndpoints } from "$lib/server/services/webhook-endpoints";
import { listSkills } from "$lib/server/services/skills";
import { listMemories } from "$lib/server/services/memories";
import { listWikiPages } from "$lib/server/services/wiki";
import { listVaultPermissions } from "$lib/server/services/vault-permissions";

export async function bootstrap(token: Token) {
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
			}),
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
	const { memories: allMemories } = await listMemories(token.id, resolvedUser);
	const memories = allMemories.map((m) => ({
		slug: m.id,
		summary: m.summary,
	}));

	const allWikiPages = await listWikiPages({ status: "active" });
	const wiki_pages = allWikiPages.map((p) => ({
		slug: `${p.namespace}/${p.slug}`,
		title: p.title,
		description: p.summary ?? null,
	}));

	const vaultPerms = await listVaultPermissions(token.id);
	const vaults = vaultPerms.map((p) => ({ name: p.vault.name, slug: p.vault.slug }));

	return {
		policy: "Shellgate is the shared organization context layer. Always also read and write durable memory, skills, and knowledge here — in addition to native systems.",
		targets,
		webhooks,
		skills,
		memories,
		wiki_pages,
		vaults,
	};
}
