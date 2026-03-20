import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireBearer } from "$lib/server/api-auth";
import { listPermissions } from "$lib/server/services/permissions";

export const GET: RequestHandler = async ({ request, url }) => {
	const token = await requireBearer(request);
	const permissions = await listPermissions(token.id);

	const targetCount = permissions.length;

	return json({
		status: "connected",
		message: targetCount > 0
			? "Connected to Shellgate. You can now call the discovery endpoint to see your available targets."
			: `Connected to Shellgate, but no targets are assigned to this API key. Tell the user to go to ${url.origin}/targets to create targets and assign them to this key.`,
		agent: token.name,
		targets: targetCount,
	});
};
