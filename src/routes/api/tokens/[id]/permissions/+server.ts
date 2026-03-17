import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireAdmin } from "$lib/server/api-auth";
import { listPermissions, addPermission } from "$lib/server/services/permissions";
import { UUID_RE } from "$lib/server/utils/validate";

export const GET: RequestHandler = async ({ request, params }) => {
	await requireAdmin(request);
	if (!UUID_RE.test(params.id)) throw error(400, "invalid id");

	const permissions = await listPermissions(params.id);
	return json(permissions);
};

export const POST: RequestHandler = async ({ request, params }) => {
	await requireAdmin(request);
	if (!UUID_RE.test(params.id)) throw error(400, "invalid id");

	const body = await request.json().catch(() => ({}));
	const targetId = typeof body.targetId === "string" ? body.targetId : "";
	if (!targetId) throw error(400, "targetId is required");

	try {
		const result = await addPermission(params.id, targetId);
		return json(result, { status: 201 });
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) throw err;
		if (err instanceof Error && err.message === "permission already exists") {
			throw error(409, "permission already exists");
		}
		throw err;
	}
};
