import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireAdmin } from "$lib/server/api-auth";
import { removePermission } from "$lib/server/services/permissions";
import { UUID_RE } from "$lib/server/utils/validate";

export const DELETE: RequestHandler = async ({ request, params }) => {
	requireAdmin(request);
	if (!UUID_RE.test(params.id)) throw error(400, "invalid id");
	if (!UUID_RE.test(params.targetId)) throw error(400, "invalid targetId");

	const result = await removePermission(params.id, params.targetId);
	if (!result) throw error(404, "permission not found");
	return json(result);
};
