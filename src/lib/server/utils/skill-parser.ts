import { parse as parseYaml } from "yaml";

export function validateSlug(slug: string): boolean {
	if (slug.length === 0 || slug.length > 64) return false;
	if (/--/.test(slug)) return false;
	return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(slug);
}

export function parseSkillMd(content: string): { slug: string; description: string } {
	const match = content.match(/^---\n([\s\S]*?)\n---/);
	if (!match) throw new Error("Invalid SKILL.md: missing YAML frontmatter");

	const frontmatter = parseYaml(match[1]);
	if (!frontmatter || typeof frontmatter !== "object") {
		throw new Error("Invalid SKILL.md: frontmatter is not a valid YAML object");
	}

	const name = frontmatter.name;
	if (typeof name !== "string" || !validateSlug(name)) {
		throw new Error(
			"Invalid SKILL.md: name must be a valid slug (1-64 lowercase alphanumeric + hyphens, no consecutive hyphens, no leading/trailing hyphens)"
		);
	}

	const description = frontmatter.description;
	if (typeof description !== "string" || description.length === 0) {
		throw new Error("Invalid SKILL.md: description is required and must be non-empty");
	}
	if (description.length > 1024) {
		throw new Error("Invalid SKILL.md: description must not exceed 1024 characters");
	}

	return { slug: name, description };
}
