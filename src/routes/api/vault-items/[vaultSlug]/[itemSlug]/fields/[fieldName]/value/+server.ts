import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireBearer } from "$lib/server/api-auth";
import { getVaultBySlug } from "$lib/server/services/vaults";
import { getItem, getFieldValue } from "$lib/server/services/vault-items";
import { hasVaultPermission } from "$lib/server/services/vault-permissions";
import { matchesOrigin } from "$lib/server/utils/origin-match";
import { logRequest } from "$lib/server/services/audit";

export const GET: RequestHandler = async ({ request, params, url, getClientAddress }) => {
	const token = await requireBearer(request);
	const origin = url.searchParams.get("origin");
	const clientIp = getClientAddress();
	const handle = `${params.vaultSlug}/${params.itemSlug}/${params.fieldName}`;

	if (!origin) {
		throw error(400, "origin query parameter is required");
	}

	const vault = await getVaultBySlug(params.vaultSlug);
	if (!vault) throw error(404, "Vault not found");

	const hasAccess = await hasVaultPermission(token.id, vault.id);
	if (!hasAccess) throw error(403, "No access to this vault");

	const item = await getItem(vault.id, params.itemSlug);
	if (!item) throw error(404, "Item not found");

	if (!matchesOrigin(origin, item.allowedOrigins as string[] | null)) {
		logRequest({
			tokenId: token.id, tokenName: token.name,
			targetId: null, targetSlug: null,
			type: "vault", method: "GET", path: handle,
			statusCode: 403, clientIp, durationMs: null,
			guardAction: "block",
			guardReason: `origin_mismatch: ${origin} not in [${(item.allowedOrigins as string[] || []).join(", ")}]`,
		});
		throw error(403, JSON.stringify({
			error: "origin_mismatch",
			allowedOrigins: item.allowedOrigins,
			actualOrigin: origin,
		}));
	}

	const value = await getFieldValue(item.id, params.fieldName);
	if (value === null) throw error(404, "Field not found");

	logRequest({
		tokenId: token.id, tokenName: token.name,
		targetId: null, targetSlug: null,
		type: "vault", method: "GET", path: handle,
		statusCode: 200, clientIp, durationMs: null,
	});


	return json({ value });
};
