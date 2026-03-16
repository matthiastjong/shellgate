import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireAdmin } from "$lib/server/api-auth";
import { getTargetBySlug } from "$lib/server/services/targets";
import { listAuthMethods, createAuthMethod } from "$lib/server/services/auth-methods";

export const GET: RequestHandler = async ({ request, params }) => {
	requireAdmin(request);

	const target = await getTargetBySlug(params.slug);
	if (!target) throw error(404, "target not found");

	const methods = await listAuthMethods(target.id);
	return json(methods);
};

export const POST: RequestHandler = async ({ request, params }) => {
	requireAdmin(request);

	const target = await getTargetBySlug(params.slug);
	if (!target) throw error(404, "target not found");

	const body = await request.json().catch(() => ({}));

	try {
		const result = await createAuthMethod(target.id, {
			label: body.label ?? "",
			type: body.type ?? "",
			credential: body.credential ?? "",
			isDefault: body.isDefault,
		});
		return json(result, { status: 201 });
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) throw err;
		if (err instanceof Error) throw error(400, err.message);
		throw err;
	}
};
