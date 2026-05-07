import { fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { createVault, listVaults, deleteVault } from "$lib/server/services/vaults";

export const load: PageServerLoad = async () => {
	const vaults = await listVaults();
	return { vaults };
};

export const actions = {
	create: async ({ request }) => {
		const data = await request.formData();
		const name = data.get("name")?.toString()?.trim() ?? "";
		const description = data.get("description")?.toString()?.trim() || undefined;

		if (!name) return fail(400, { error: "Name is required" });

		try {
			const vault = await createVault({ name, description });
			return { created: vault };
		} catch (err) {
			return fail(400, { error: err instanceof Error ? err.message : "Failed to create vault" });
		}
	},

	delete: async ({ request }) => {
		const data = await request.formData();
		const id = data.get("id")?.toString() ?? "";
		if (!id) return fail(400, { error: "ID is required" });

		try {
			await deleteVault(id);
			return { deleted: id };
		} catch (err) {
			return fail(500, { error: err instanceof Error ? err.message : "Failed to delete" });
		}
	},
} satisfies Actions;
