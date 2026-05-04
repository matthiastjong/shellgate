import { beforeEach, describe, expect, it } from "vitest";
import { truncateAll } from "../helpers";

const validSkillMd = `---
name: deploy-hotfix
description: Deploy a hotfix to production. Use when deploying urgent fixes.
---

## Steps

1. Check branch is up to date
2. Push to production`;

const updatedSkillMd = `---
name: deploy-hotfix
description: Deploy a hotfix to production. Updated instructions.
---

## Steps

1. Updated step`;

const anotherSkillMd = `---
name: code-review
description: Review code changes for quality and correctness.
---

Review instructions here.`;

describe("skills service", () => {
	beforeEach(async () => {
		await truncateAll();
	});

	it("creates a skill from valid SKILL.md content", async () => {
		const { createSkill } = await import("$lib/server/services/skills");
		const skill = await createSkill(validSkillMd);

		expect(skill.id).toBeDefined();
		expect(skill.slug).toBe("deploy-hotfix");
		expect(skill.description).toBe("Deploy a hotfix to production. Use when deploying urgent fixes.");
		expect(skill.contentMd).toBe(validSkillMd);
		expect(skill.version).toBe(1);
	});

	it("rejects invalid SKILL.md content", async () => {
		const { createSkill } = await import("$lib/server/services/skills");
		await expect(createSkill("# No frontmatter")).rejects.toThrow("frontmatter");
	});

	it("rejects duplicate slugs", async () => {
		const { createSkill } = await import("$lib/server/services/skills");
		await createSkill(validSkillMd);
		await expect(createSkill(validSkillMd)).rejects.toThrow();
	});

	it("lists skills with slug and description only", async () => {
		const { createSkill, listSkills } = await import("$lib/server/services/skills");
		await createSkill(validSkillMd);
		await createSkill(anotherSkillMd);

		const list = await listSkills();
		// List includes built-in skills + 2 DB skills
		expect(list.length).toBeGreaterThanOrEqual(2);
		const dbSkills = list.filter((s) => !s.builtIn);
		expect(dbSkills).toHaveLength(2);
		expect(list[0]).toHaveProperty("slug");
		expect(list[0]).toHaveProperty("description");
		expect(list[0]).not.toHaveProperty("contentMd");
	});

	it("gets a skill by slug", async () => {
		const { createSkill, getSkill } = await import("$lib/server/services/skills");
		await createSkill(validSkillMd);
		const skill = await getSkill("deploy-hotfix");

		expect(skill).not.toBeNull();
		expect(skill!.slug).toBe("deploy-hotfix");
		expect(skill!.contentMd).toBe(validSkillMd);
	});

	it("returns null for non-existent skill", async () => {
		const { getSkill } = await import("$lib/server/services/skills");
		const skill = await getSkill("non-existent");
		expect(skill).toBeNull();
	});

	it("updates a skill and increments version", async () => {
		const { createSkill, updateSkill, getSkill } = await import("$lib/server/services/skills");
		await createSkill(validSkillMd);
		const updated = await updateSkill("deploy-hotfix", updatedSkillMd);

		expect(updated).not.toBeNull();
		expect(updated!.version).toBe(2);
		expect(updated!.description).toBe("Deploy a hotfix to production. Updated instructions.");
		expect(updated!.contentMd).toBe(updatedSkillMd);
	});

	it("rejects update with mismatched slug", async () => {
		const { createSkill, updateSkill } = await import("$lib/server/services/skills");
		await createSkill(validSkillMd);
		await expect(updateSkill("deploy-hotfix", anotherSkillMd)).rejects.toThrow("does not match");
	});

	it("returns null when updating non-existent skill", async () => {
		const { updateSkill } = await import("$lib/server/services/skills");
		const result = await updateSkill("non-existent", validSkillMd);
		expect(result).toBeNull();
	});

	it("deletes a skill", async () => {
		const { createSkill, deleteSkill, getSkill } = await import("$lib/server/services/skills");
		await createSkill(validSkillMd);
		const result = await deleteSkill("deploy-hotfix");
		expect(result).toBe(true);

		const deleted = await getSkill("deploy-hotfix");
		expect(deleted).toBeNull();
	});

	it("returns false when deleting non-existent skill", async () => {
		const { deleteSkill } = await import("$lib/server/services/skills");
		const result = await deleteSkill("non-existent");
		expect(result).toBe(false);
	});
});
