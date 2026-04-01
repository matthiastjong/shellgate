import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { getBaseUrl } from "$lib/server/utils/base-url";
import { generateHermesScript } from "$lib/server/utils/install-scripts";

export const POST: RequestHandler = async ({ request, url }) => {
	const body = await request.json().catch(() => null);
	const token = body?.token;

	if (!token?.startsWith("sg_")) {
		throw error(400, "Invalid token format");
	}

	const baseUrl = getBaseUrl(request, url);
	const script = generateHermesScript(baseUrl, token);

	return new Response(script, {
		headers: { "Content-Type": "text/plain" },
	});
};
