import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireAdmin } from "$lib/server/api-auth";
import { listTargets, createTarget } from "$lib/server/services/targets";

export const GET: RequestHandler = async ({ request }) => {
	await requireAdmin(request);
	const targets = await listTargets();
	return json(targets);
};

export const POST: RequestHandler = async ({ request }) => {
	await requireAdmin(request);
	const body = await request.json().catch(() => ({}));

	const name = typeof body.name === "string" ? body.name.trim() : "";
	if (!name) throw error(400, "name is required");

	const type = body.type;
	if (type !== "api" && type !== "ssh") throw error(400, "type must be 'api' or 'ssh'");

	try {
		const result = await createTarget({ name, type, base_url: body.base_url ?? null, config: body.config ?? null });
		return json(result, { status: 201 });
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) throw err;
		if (err instanceof Error) throw error(400, err.message);
		throw err;
	}
};
