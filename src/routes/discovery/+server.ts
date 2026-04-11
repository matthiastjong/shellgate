import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireBearer } from "$lib/server/api-auth";
import { listPermissions } from "$lib/server/services/permissions";
import { getTargetById } from "$lib/server/services/targets";
import { listEndpoints } from "$lib/server/services/webhook-endpoints";

export const GET: RequestHandler = async ({ request, url }) => {
	const token = await requireBearer(request);

	const permissions = await listPermissions(token.id);

	const targets = await Promise.all(
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
	);

	const filtered = targets.filter(Boolean);

	const webhookEndpointsList = await listEndpoints(token.id);
	const webhooks = webhookEndpointsList
		.filter((ep) => ep.enabled)
		.map((ep) => ({
			name: ep.name,
			poll: "/webhooks/poll",
			ack: "/webhooks/ack",
		}));

	return json({
		targets: filtered,
		webhooks,
		...(filtered.length === 0 && webhooks.length === 0 && {
			message: `No targets or webhooks are assigned to this API key. Tell the user to go to ${url.origin}/api-keys to add targets, or ${url.origin}/webhooks to set up webhooks.`,
		}),
	});
};
