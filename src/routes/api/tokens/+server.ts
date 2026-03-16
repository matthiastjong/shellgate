import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireAdmin } from "$lib/server/api-auth";
import { listTokens, createToken } from "$lib/server/services/tokens";

export const GET: RequestHandler = async ({ request }) => {
	requireAdmin(request);
	const tokens = await listTokens();
	return json(tokens);
};

export const POST: RequestHandler = async ({ request }) => {
	requireAdmin(request);
	const body = await request.json().catch(() => ({}));
	const name = typeof body.name === "string" ? body.name.trim() : "";
	if (!name) throw error(400, "name is required");
	if (name.length > 255) throw error(400, "name must be 255 characters or less");

	const result = await createToken(name);
	return json({ ...result.token, token: result.plainToken }, { status: 201 });
};
