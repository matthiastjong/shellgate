import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireBearer } from "$lib/server/api-auth";
import { bootstrap } from "$lib/server/mcp/tools/bootstrap";

export const GET: RequestHandler = async ({ request }) => {
	const token = await requireBearer(request);
	const result = await bootstrap(token);
	return json(result);
};
