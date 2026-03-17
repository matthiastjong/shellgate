import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireAdmin } from "$lib/server/api-auth";
import { getTargetById, updateTarget, deleteTarget } from "$lib/server/services/targets";
import { UUID_RE } from "$lib/server/utils/validate";

export const GET: RequestHandler = async ({ request, params }) => {
	await requireAdmin(request);
	if (!UUID_RE.test(params.id)) throw error(400, "invalid id");

	const target = await getTargetById(params.id);
	if (!target) throw error(404, "target not found");
	return json(target);
};

export const PATCH: RequestHandler = async ({ request, params }) => {
	await requireAdmin(request);
	if (!UUID_RE.test(params.id)) throw error(400, "invalid id");

	const body = await request.json().catch(() => ({}));

	try {
		const result = await updateTarget(params.id, {
			name: body.name,
			type: body.type,
			base_url: body.base_url,
			enabled: body.enabled,
		});
		if (!result) throw error(404, "target not found");
		return json(result);
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) throw err;
		if (err instanceof Error) throw error(400, err.message);
		throw err;
	}
};

export const DELETE: RequestHandler = async ({ request, params }) => {
	await requireAdmin(request);
	if (!UUID_RE.test(params.id)) throw error(400, "invalid id");

	const result = await deleteTarget(params.id);
	if (!result) throw error(404, "target not found");
	return json(result);
};
