import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireAdmin } from "$lib/server/api-auth";
import { createEndpoint, listEndpoints } from "$lib/server/services/webhook-endpoints";

export const GET: RequestHandler = async ({ request, url }) => {
	await requireAdmin(request);
	const tokenId = url.searchParams.get("tokenId") ?? undefined;
	const endpoints = await listEndpoints(tokenId);
	return json(endpoints);
};

export const POST: RequestHandler = async ({ request }) => {
	await requireAdmin(request);
	const body = await request.json().catch(() => ({}));

	const tokenId = typeof body.tokenId === "string" ? body.tokenId.trim() : "";
	if (!tokenId) throw error(400, "tokenId is required");

	const name = typeof body.name === "string" ? body.name.trim() : "";
	if (!name) throw error(400, "name is required");

	const secret = typeof body.secret === "string" && body.secret.trim() ? body.secret.trim() : undefined;
	const signatureHeader = typeof body.signatureHeader === "string" && body.signatureHeader.trim()
		? body.signatureHeader.trim()
		: undefined;

	const endpoint = await createEndpoint(tokenId, { name, secret, signatureHeader });
	return json(endpoint, { status: 201 });
};
