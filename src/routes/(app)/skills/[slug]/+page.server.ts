import { error, fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { getSkill, updateSkill, deleteSkill } from "$lib/server/services/skills";

export const load: PageServerLoad = async ({ params }) => {
	const skill = await getSkill(params.slug);
	if (!skill) throw error(404, "Skill not found");
	return { skill };
};

export const actions = {
	update: async ({ request, params }) => {
		const data = await request.formData();
		const content = data.get("content")?.toString() ?? "";
		if (!content) return fail(400, { error: "Content is required" });

		try {
			const skill = await updateSkill(params.slug, content);
			if (!skill) return fail(404, { error: "Skill not found" });
			return { updated: skill };
		} catch (err) {
			return fail(400, { error: err instanceof Error ? err.message : "Failed to update" });
		}
	},

	delete: async ({ params }) => {
		const deleted = await deleteSkill(params.slug);
		if (!deleted) return fail(404, { error: "Skill not found" });
		return { deleted: params.slug };
	},
} satisfies Actions;
