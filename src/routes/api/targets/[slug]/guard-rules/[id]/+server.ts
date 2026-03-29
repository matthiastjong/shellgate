import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireAdmin } from "$lib/server/api-auth";
import { getTargetBySlug } from "$lib/server/services/targets";
import { updateGuardRule, deleteGuardRule } from "$lib/server/services/guard-rules";
import { UUID_RE } from "$lib/server/utils/validate";

export const PATCH: RequestHandler = async ({ request, params }) => {
	await requireAdmin(request);

	const target = await getTargetBySlug(params.slug);
	if (!target) throw error(404, "target not found");
	if (!UUID_RE.test(params.id)) throw error(400, "invalid id");

	const body = await request.json().catch(() => ({}));

	try {
		const result = await updateGuardRule(target.id, params.id, body);
		if (!result) throw error(404, "guard rule not found");
		return json(result);
	} catch (err) {
		if (err && typeof err === "object" && "status" in err) throw err;
		if (err instanceof Error) throw error(400, err.message);
		throw err;
	}
};

export const DELETE: RequestHandler = async ({ request, params }) => {
	await requireAdmin(request);

	const target = await getTargetBySlug(params.slug);
	if (!target) throw error(404, "target not found");
	if (!UUID_RE.test(params.id)) throw error(400, "invalid id");

	const result = await deleteGuardRule(target.id, params.id);
	if (!result) throw error(404, "guard rule not found");
	return json({ id: params.id, deleted: true });
};
