import { listSkills, getSkill, createSkill, updateSkill, deleteSkill, markSkillUsed } from "$lib/server/services/skills";
import { parseSkillMd } from "$lib/server/utils/skill-parser";
import { isBuiltInSkill } from "$lib/server/built-in-skills";

export async function skillList() {
	return listSkills();
}

export async function skillRead(args: { slug: string }) {
	const skill = await getSkill(args.slug);
	if (!skill) return { error: `Skill "${args.slug}" not found` };
	const lastUsedAt = skill.builtIn ? skill.lastUsedAt : await markSkillUsed(skill.slug);
	return {
		slug: skill.slug,
		description: skill.description,
		content: skill.contentMd,
		version: skill.version,
		last_used_at: lastUsedAt?.toISOString() ?? null,
	};
}

export async function skillUpsert(args: { content: string }) {
	if (!args.content || typeof args.content !== "string") {
		return { error: "content is required" };
	}
	let parsed: { slug: string; description: string };
	try {
		parsed = parseSkillMd(args.content);
	} catch (err) {
		return { error: err instanceof Error ? err.message : "Invalid skill content" };
	}
	if (isBuiltInSkill(parsed.slug)) {
		return { error: `Skill "${parsed.slug}" is a built-in skill and cannot be modified` };
	}
	const existing = await getSkill(parsed.slug);
	if (existing && !existing.builtIn) {
		const updated = await updateSkill(parsed.slug, args.content);
		return { slug: updated!.slug, version: updated!.version };
	}
	const created = await createSkill(args.content);
	return { slug: created.slug, version: created.version };
}

export async function skillDelete(args: { slug: string }) {
	if (isBuiltInSkill(args.slug)) {
		return { error: `Skill "${args.slug}" is a built-in skill and cannot be deleted` };
	}
	const deleted = await deleteSkill(args.slug);
	if (!deleted) return { error: `Skill "${args.slug}" not found` };
	return { deleted: true };
}
