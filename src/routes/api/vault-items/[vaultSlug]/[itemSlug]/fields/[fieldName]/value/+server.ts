import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireBearer } from "$lib/server/api-auth";
import { getVaultBySlug } from "$lib/server/services/vaults";
import { getItem, getFieldValue } from "$lib/server/services/vault-items";
import { hasVaultPermission } from "$lib/server/services/vault-permissions";

export const GET: RequestHandler = async ({ request, params }) => {
	const token = await requireBearer(request);

	const vault = await getVaultBySlug(params.vaultSlug);
	if (!vault) throw error(404, "Vault not found");

	const hasAccess = await hasVaultPermission(token.id, vault.id);
	if (!hasAccess) throw error(403, "No access to this vault");

	const item = await getItem(vault.id, params.itemSlug);
	if (!item) throw error(404, "Item not found");

	const value = await getFieldValue(item.id, params.fieldName);
	if (value === null) throw error(404, "Field not found");

	return json({ value });
};
