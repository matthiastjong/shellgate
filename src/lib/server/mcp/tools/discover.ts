import { listPermissions } from "$lib/server/services/permissions";
import { getTargetById } from "$lib/server/services/targets";
import { listEndpoints } from "$lib/server/services/webhook-endpoints";
import { listSkills } from "$lib/server/services/skills";
import { countMemories } from "$lib/server/services/memories";
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

	return { targets, webhooks, skills, memoryCount };
}
