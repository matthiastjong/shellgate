import { fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { listSkills, createSkill, deleteSkill } from "$lib/server/services/skills";

export const load: PageServerLoad = async () => {
	const skills = await listSkills();
	return { skills };
};

export const actions = {
	create: async ({ request }) => {
		const data = await request.formData();
		const content = data.get("content")?.toString() ?? "";
		if (!content) return fail(400, { error: "Content is required" });

		try {
			const skill = await createSkill(content);
			return { created: skill };
		} catch (err) {
			return fail(400, { error: err instanceof Error ? err.message : "Failed to create skill" });
		}
	},

	delete: async ({ request }) => {
		const data = await request.formData();
		const slug = data.get("slug")?.toString() ?? "";
		if (!slug) return fail(400, { error: "Slug is required" });

		try {
			const deleted = await deleteSkill(slug);
			if (!deleted) return fail(404, { error: "Skill not found" });
			return { deleted: slug };
		} catch (err) {
			return fail(500, { error: err instanceof Error ? err.message : "Failed to delete" });
		}
	},
} satisfies Actions;
