import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import { skills } from "../db/schema";
import { parseSkillMd } from "../utils/skill-parser";
import { getBuiltInSkills, getBuiltInSkill, isBuiltInSkill } from "../built-in-skills";

export async function listSkills() {
	const dbSkills = await db
		.select({
			slug: skills.slug,
			description: skills.description,
		})
		.from(skills)
		.orderBy(skills.slug);

	const builtIn = getBuiltInSkills().map((s) => ({
		slug: s.slug,
		description: s.description,
		builtIn: true,
	}));

	const dbWithFlag = dbSkills.map((s) => ({ ...s, builtIn: false }));

	return [...builtIn, ...dbWithFlag].sort((a, b) => a.slug.localeCompare(b.slug));
}

export async function getSkill(slug: string) {
	const builtIn = getBuiltInSkill(slug);
	if (builtIn) {
		return {
			id: `built-in-${builtIn.slug}`,
			slug: builtIn.slug,
			description: builtIn.description,
			contentMd: builtIn.contentMd,
			version: builtIn.version,
			builtIn: true,
			createdAt: new Date(0),
			updatedAt: new Date(0),
		};
	}

	const [row] = await db
		.select()
		.from(skills)
		.where(eq(skills.slug, slug))
		.limit(1);
	return row ? { ...row, builtIn: false } : null;
}

export async function createSkill(contentMd: string) {
	const { slug, description } = parseSkillMd(contentMd);
	const [row] = await db
		.insert(skills)
		.values({ slug, description, contentMd })
		.returning();
	return row;
}

export async function updateSkill(slug: string, contentMd: string) {
	const existing = await getSkill(slug);
	if (!existing) return null;

	const parsed = parseSkillMd(contentMd);
	if (parsed.slug !== slug) {
		throw new Error(`Frontmatter name "${parsed.slug}" does not match URL slug "${slug}"`);
	}

	const [row] = await db
		.update(skills)
		.set({
			description: parsed.description,
			contentMd,
			version: sql`${skills.version} + 1`,
			updatedAt: new Date(),
		})
		.where(eq(skills.slug, slug))
		.returning();
	return row ?? null;
}

export async function deleteSkill(slug: string) {
	const result = await db
		.delete(skills)
		.where(eq(skills.slug, slug))
		.returning({ id: skills.id });
	return result.length > 0;
}
