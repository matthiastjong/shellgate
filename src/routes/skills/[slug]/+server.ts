import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireBearer } from "$lib/server/api-auth";
import { getSkill, updateSkill, deleteSkill } from "$lib/server/services/skills";

export const GET: RequestHandler = async ({ request, params }) => {
	await requireBearer(request);
	const skill = await getSkill(params.slug);
	if (!skill) throw error(404, "Skill not found");

	return json({
		slug: skill.slug,
		description: skill.description,
		content: skill.contentMd,
		version: skill.version,
	});
};

export const PUT: RequestHandler = async ({ request, params }) => {
	await requireBearer(request);
	const body = await request.json().catch(() => ({}));

	const content = typeof body.content === "string" ? body.content : "";
	if (!content) throw error(400, "content is required");

	try {
		const skill = await updateSkill(params.slug, content);
		if (!skill) throw error(404, "Skill not found");
		return json({
			slug: skill.slug,
			description: skill.description,
			content: skill.contentMd,
			version: skill.version,
		});
	} catch (err) {
		if (err instanceof Error && "status" in err) throw err;
		throw error(400, err instanceof Error ? err.message : "Failed to update skill");
	}
};

export const DELETE: RequestHandler = async ({ request, params }) => {
	await requireBearer(request);
	const deleted = await deleteSkill(params.slug);
	if (!deleted) throw error(404, "Skill not found");
	return json({ ok: true });
};
