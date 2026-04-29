import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireAdmin } from "$lib/server/api-auth";
import { listSkills, createSkill } from "$lib/server/services/skills";

export const GET: RequestHandler = async ({ request }) => {
	await requireAdmin(request);
	const list = await listSkills();
	return json({ skills: list });
};

export const POST: RequestHandler = async ({ request }) => {
	await requireAdmin(request);
	const body = await request.json().catch(() => ({}));

	const content = typeof body.content === "string" ? body.content : "";
	if (!content) throw error(400, "content is required");

	try {
		const skill = await createSkill(content);
		return json(skill, { status: 201 });
	} catch (err) {
		throw error(400, err instanceof Error ? err.message : "Failed to create skill");
	}
};
