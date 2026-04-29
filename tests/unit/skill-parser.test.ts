import { describe, expect, it } from "vitest";
import { parseSkillMd, validateSlug } from "$lib/server/utils/skill-parser";

describe("validateSlug", () => {
	it("accepts valid slugs", () => {
		expect(validateSlug("deploy-hotfix")).toBe(true);
		expect(validateSlug("a")).toBe(true);
		expect(validateSlug("code-review")).toBe(true);
		expect(validateSlug("a1b2c3")).toBe(true);
	});

	it("rejects uppercase", () => {
		expect(validateSlug("Deploy-Hotfix")).toBe(false);
	});

	it("rejects consecutive hyphens", () => {
		expect(validateSlug("deploy--hotfix")).toBe(false);
	});

	it("rejects leading hyphen", () => {
		expect(validateSlug("-deploy")).toBe(false);
	});

	it("rejects trailing hyphen", () => {
		expect(validateSlug("deploy-")).toBe(false);
	});

	it("rejects empty string", () => {
		expect(validateSlug("")).toBe(false);
	});

	it("rejects over 64 chars", () => {
		expect(validateSlug("a".repeat(65))).toBe(false);
	});

	it("rejects special characters", () => {
		expect(validateSlug("deploy_hotfix")).toBe(false);
		expect(validateSlug("deploy.hotfix")).toBe(false);
		expect(validateSlug("deploy hotfix")).toBe(false);
	});
});

describe("parseSkillMd", () => {
	it("parses valid SKILL.md", () => {
		const content = `---
name: deploy-hotfix
description: Deploy a hotfix to production.
---

## Steps

1. Do the thing`;

		const result = parseSkillMd(content);
		expect(result).toEqual({
			slug: "deploy-hotfix",
			description: "Deploy a hotfix to production.",
		});
	});

	it("parses SKILL.md with optional fields", () => {
		const content = `---
name: code-review
description: Review code changes for quality and correctness.
license: Apache-2.0
metadata:
  author: we-compare
  version: "1"
---

Instructions here.`;

		const result = parseSkillMd(content);
		expect(result).toEqual({
			slug: "code-review",
			description: "Review code changes for quality and correctness.",
		});
	});

	it("throws on missing frontmatter", () => {
		expect(() => parseSkillMd("# No frontmatter")).toThrow("missing YAML frontmatter");
	});

	it("throws on missing name", () => {
		const content = `---
description: Has description but no name.
---
Body`;
		expect(() => parseSkillMd(content)).toThrow("name");
	});

	it("throws on missing description", () => {
		const content = `---
name: test-skill
---
Body`;
		expect(() => parseSkillMd(content)).toThrow("description");
	});

	it("throws on invalid slug in name field", () => {
		const content = `---
name: Invalid-Name
description: Has uppercase.
---
Body`;
		expect(() => parseSkillMd(content)).toThrow("name");
	});

	it("throws on description exceeding 1024 chars", () => {
		const content = `---
name: test-skill
description: ${"a".repeat(1025)}
---
Body`;
		expect(() => parseSkillMd(content)).toThrow("description");
	});
});
