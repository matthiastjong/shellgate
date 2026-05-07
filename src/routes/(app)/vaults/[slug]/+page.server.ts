import { error, fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { getVaultBySlug } from "$lib/server/services/vaults";
import { createItem, listItems, deleteItem } from "$lib/server/services/vault-items";

export const load: PageServerLoad = async ({ params }) => {
	const vault = await getVaultBySlug(params.slug);
	if (!vault) throw error(404, "Vault not found");

	const items = await listItems(vault.id);
	return { vault, items };
};

export const actions = {
	createItem: async ({ request, params }) => {
		const vault = await getVaultBySlug(params.slug);
		if (!vault) return fail(404, { error: "Vault not found" });

		const data = await request.formData();
		const name = data.get("name")?.toString()?.trim() ?? "";
		const domain = data.get("domain")?.toString()?.trim() || undefined;
		const description = data.get("description")?.toString()?.trim() || undefined;

		if (!name) return fail(400, { error: "Name is required" });

		try {
			const item = await createItem(vault.id, { name, domain, description });
			return { created: item };
		} catch (err) {
			return fail(400, { error: err instanceof Error ? err.message : "Failed to create item" });
		}
	},

	deleteItem: async ({ request }) => {
		const data = await request.formData();
		const id = data.get("id")?.toString() ?? "";
		if (!id) return fail(400, { error: "ID is required" });

		try {
			await deleteItem(id);
			return { deleted: id };
		} catch (err) {
			return fail(500, { error: err instanceof Error ? err.message : "Failed to delete" });
		}
	},
} satisfies Actions;
