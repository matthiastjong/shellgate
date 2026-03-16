import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireAdmin } from "$lib/server/api-auth";
import { getTargetBySlug } from "$lib/server/services/targets";
import { updateAuthMethod, deleteAuthMethod } from "$lib/server/services/auth-methods";
import { UUID_RE } from "$lib/server/utils/validate";

export const PATCH: RequestHandler = async ({ request, params }) => {
	requireAdmin(request);

	const target = await getTargetBySlug(params.slug);
	if (!target) throw error(404, "target not found");
	if (!UUID_RE.test(params.id)) throw error(400, "invalid id");

	const body = await request.json().catch(() => ({}));

	try {
		const result = await updateAuthMethod(target.id, params.id, {
			label: body.label,
			credential: body.credential,
			isDefault: body.isDefault,
		});
		if (!result) throw error(404, "auth method not found");
		return json(result);
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) throw err;
		if (err instanceof Error) throw error(400, err.message);
		throw err;
	}
};

export const DELETE: RequestHandler = async ({ request, params }) => {
	requireAdmin(request);

	const target = await getTargetBySlug(params.slug);
	if (!target) throw error(404, "target not found");
	if (!UUID_RE.test(params.id)) throw error(400, "invalid id");

	const result = await deleteAuthMethod(target.id, params.id);
	if (!result) throw error(404, "auth method not found");
	return json(result);
};
