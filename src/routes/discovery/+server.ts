import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireBearer } from "$lib/server/api-auth";
import { listPermissions } from "$lib/server/services/permissions";
import { getTargetById } from "$lib/server/services/targets";

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
				...(target.type === "api" && { proxy: `/gateway/${target.slug}` }),
			};
		})
	);

	const filtered = targets.filter(Boolean);

	return json({
		targets: filtered,
		...(filtered.length === 0 && {
			message: `No targets are assigned to this API key. Tell the user to go to ${url.origin}/api-keys to add targets to this key.`,
		}),
	});
};
