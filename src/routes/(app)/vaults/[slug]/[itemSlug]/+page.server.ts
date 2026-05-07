import { error, fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { getVaultBySlug } from "$lib/server/services/vaults";
import { getItem, updateItem, addField, updateField, deleteField } from "$lib/server/services/vault-items";
import { db } from "$lib/server/db";
import { vaultItemFields } from "$lib/server/db/schema";
import { eq } from "drizzle-orm";
import { decrypt } from "$lib/server/utils/crypto";

export const load: PageServerLoad = async ({ params }) => {
	const vault = await getVaultBySlug(params.slug);
	if (!vault) throw error(404, "Vault not found");

	const item = await getItem(vault.id, params.itemSlug);
	if (!item) throw error(404, "Item not found");

	return { vault, item };
};

export const actions = {
	updateItem: async ({ request, params }) => {
		const vault = await getVaultBySlug(params.slug);
		if (!vault) return fail(404, { error: "Vault not found" });

		const item = await getItem(vault.id, params.itemSlug);
		if (!item) return fail(404, { error: "Item not found" });

		const data = await request.formData();
		const domain = data.get("domain")?.toString()?.trim() || null;
		const description = data.get("description")?.toString()?.trim() || null;

		await updateItem(item.id, { domain, description });
		return { updated: true };
	},

	addField: async ({ request, params }) => {
		const vault = await getVaultBySlug(params.slug);
		if (!vault) return fail(404, { error: "Vault not found" });

		const item = await getItem(vault.id, params.itemSlug);
		if (!item) return fail(404, { error: "Item not found" });

		const data = await request.formData();
		const name = data.get("name")?.toString()?.trim() ?? "";
		const value = data.get("value")?.toString() ?? "";
		const sensitive = data.get("sensitive") === "true";

		if (!name) return fail(400, { error: "Field name is required" });
		if (!value) return fail(400, { error: "Field value is required" });

		try {
			const field = await addField(item.id, { name, value, sensitive });
			return {
				addedField: {
					id: field.id,
					name: field.name,
					sensitive: field.sensitive,
					sortOrder: field.sortOrder,
					value: sensitive ? undefined : value,
				},
			};
		} catch (err) {
			return fail(400, { error: err instanceof Error ? err.message : "Failed to add field" });
		}
	},

	updateField: async ({ request }) => {
		const data = await request.formData();
		const id = data.get("id")?.toString() ?? "";
		const value = data.get("value")?.toString() ?? "";
		const sensitiveRaw = data.get("sensitive")?.toString();

		if (!id) return fail(400, { error: "Field ID is required" });

		const updates: { value?: string; sensitive?: boolean } = {};
		if (value) updates.value = value;
		if (sensitiveRaw !== undefined && sensitiveRaw !== null) updates.sensitive = sensitiveRaw === "true";

		try {
			await updateField(id, updates);
			return { updatedField: id };
		} catch (err) {
			return fail(400, { error: err instanceof Error ? err.message : "Failed to update field" });
		}
	},

	deleteField: async ({ request }) => {
		const data = await request.formData();
		const id = data.get("id")?.toString() ?? "";
		if (!id) return fail(400, { error: "Field ID is required" });

		try {
			await deleteField(id);
			return { deletedField: id };
		} catch (err) {
			return fail(500, { error: err instanceof Error ? err.message : "Failed to delete field" });
		}
	},

	revealField: async ({ request }) => {
		const data = await request.formData();
		const id = data.get("id")?.toString() ?? "";
		if (!id) return fail(400, { error: "Field ID is required" });

		const [field] = await db.select().from(vaultItemFields).where(eq(vaultItemFields.id, id)).limit(1);
		if (!field) return fail(404, { error: "Field not found" });

		try {
			const value = decrypt(field.encryptedValue);
			return { revealedField: { id, value } };
		} catch (err) {
			return fail(500, { error: err instanceof Error ? err.message : "Failed to decrypt field" });
		}
	},
} satisfies Actions;
