import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireAdmin } from "$lib/server/api-auth";
import { renameToken, revokeToken } from "$lib/server/services/tokens";
import { UUID_RE } from "$lib/server/utils/validate";

export const PATCH: RequestHandler = async ({ request, params }) => {
	requireAdmin(request);
	if (!UUID_RE.test(params.id)) throw error(400, "invalid id");

	const body = await request.json().catch(() => ({}));
	const name = typeof body.name === "string" ? body.name.trim() : "";
	if (!name) throw error(400, "name is required");
	if (name.length > 255) throw error(400, "name must be 255 characters or less");

	const result = await renameToken(params.id, name);
	if (!result) throw error(404, "token not found");
	return json(result);
};

export const DELETE: RequestHandler = async ({ request, params }) => {
	requireAdmin(request);
	if (!UUID_RE.test(params.id)) throw error(400, "invalid id");

	const result = await revokeToken(params.id);
	if (!result) throw error(404, "token not found");
	return json(result);
};
