import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import { skills } from "../db/schema";
import { parseSkillMd } from "../utils/skill-parser";

export async function listSkills() {
	return db
		.select({
			slug: skills.slug,
			description: skills.description,
		})
		.from(skills)
		.orderBy(skills.slug);
}

export async function getSkill(slug: string) {
	const [row] = await db
		.select()
		.from(skills)
		.where(eq(skills.slug, slug))
		.limit(1);
	return row ?? null;
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
