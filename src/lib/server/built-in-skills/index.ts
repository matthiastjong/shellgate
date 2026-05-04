import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSkillMd } from "../utils/skill-parser";

export type BuiltInSkill = {
	slug: string;
	description: string;
	contentMd: string;
	version: 1;
	builtIn: true;
};

let _cache: BuiltInSkill[] | null = null;

export function getBuiltInSkills(): BuiltInSkill[] {
	if (_cache) return _cache;

	const dir = dirname(fileURLToPath(import.meta.url));
	const files = readdirSync(dir).filter((f) => f.endsWith(".md"));

	_cache = files.map((file) => {
		const contentMd = readFileSync(join(dir, file), "utf-8");
		const { slug, description } = parseSkillMd(contentMd);
		return { slug, description, contentMd, version: 1 as const, builtIn: true as const };
	});

	return _cache;
}

export function getBuiltInSkill(slug: string): BuiltInSkill | null {
	return getBuiltInSkills().find((s) => s.slug === slug) ?? null;
}

export function isBuiltInSkill(slug: string): boolean {
	return getBuiltInSkills().some((s) => s.slug === slug);
}
