import { parseSkillMd } from "../utils/skill-parser";

// Inline imports — Vite bundles these as strings so they work in Docker
import wikiReadContextMd from "./wiki-read-context.md?raw";
import wikiUpdatePageMd from "./wiki-update-page.md?raw";
import wikiCreatePageMd from "./wiki-create-page.md?raw";
import wikiCompileResearchMd from "./wiki-compile-research.md?raw";
import wikiMaintainIndexMd from "./wiki-maintain-index.md?raw";

export type BuiltInSkill = {
	slug: string;
	description: string;
	contentMd: string;
	version: 1;
	builtIn: true;
};

const RAW_SKILLS = [
	wikiReadContextMd,
	wikiUpdatePageMd,
	wikiCreatePageMd,
	wikiCompileResearchMd,
	wikiMaintainIndexMd,
];

let _cache: BuiltInSkill[] | null = null;

export function getBuiltInSkills(): BuiltInSkill[] {
	if (_cache) return _cache;

	_cache = RAW_SKILLS.map((contentMd) => {
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
