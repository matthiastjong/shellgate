import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireAdmin } from "$lib/server/api-auth";
import { regenerateToken } from "$lib/server/services/tokens";
import { UUID_RE } from "$lib/server/utils/validate";

export const POST: RequestHandler = async ({ request, params }) => {
	await requireAdmin(request);
	if (!UUID_RE.test(params.id)) throw error(400, "invalid id");

	const result = await regenerateToken(params.id);
	if (!result) throw error(404, "token not found");
	return json({ ...result.token, token: result.plainToken });
};
