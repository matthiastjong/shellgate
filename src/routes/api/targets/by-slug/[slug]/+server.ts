import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireAdmin } from "$lib/server/api-auth";
import { getTargetBySlug } from "$lib/server/services/targets";

export const GET: RequestHandler = async ({ request, params }) => {
	requireAdmin(request);

	const target = await getTargetBySlug(params.slug);
	if (!target) throw error(404, "target not found");
	return json(target);
};
