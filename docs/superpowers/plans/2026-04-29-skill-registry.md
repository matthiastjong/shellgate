# Skill Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a skill registry to Shellgate where agents can discover, read, create, update, and delete Agent Skills spec-compliant skills via HTTP API and dashboard.

**Architecture:** New `skills` table + `skills.ts` service + agent-facing routes (`/skills/`) + admin routes (`/api/skills/`) + dashboard pages + discovery extension + gateway skill update. Follows existing patterns from webhook-endpoints.

**Tech Stack:** SvelteKit, Drizzle ORM, PostgreSQL, Vitest + Testcontainers, shadcn-svelte

**Spec:** `docs/superpowers/specs/2026-04-29-skill-registry-design.md`

---

### Task 1: Database Schema

**Files:**
- Modify: `src/lib/server/db/schema.ts`
- Modify: `tests/helpers.ts`

- [ ] **Step 1: Add skills table to schema**

Add after the `webhookEvents` table definition in `src/lib/server/db/schema.ts`:

```ts
export const skills = pgTable("skills", {
	id: uuid("id").primaryKey().defaultRandom(),
	slug: varchar("slug", { length: 64 }).notNull().unique(),
	description: varchar("description", { length: 1024 }).notNull(),
	contentMd: text("content_md").notNull(),
	version: integer("version").notNull().default(1),
	createdAt: timestamp("created_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});

export type Skill = typeof skills.$inferSelect;
```

- [ ] **Step 2: Add skills to truncateAll in test helpers**

In `tests/helpers.ts`, add the `skills` import and truncation. Add `skills` to the import:

```ts
import { tokens, targets, targetAuthMethods, tokenPermissions, users, webhookEndpoints, webhookEvents, skills } from "$lib/server/db/schema";
```

Add `await db.delete(skills);` as the first line in `truncateAll()` (before webhookEvents, since skills has no foreign key dependencies).

- [ ] **Step 3: Verify schema pushes cleanly**

Run: `npx drizzle-kit push --force`
Expected: Schema pushed successfully, no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/server/db/schema.ts tests/helpers.ts
git commit -m "feat(skills): add skills table to database schema"
```

---

### Task 2: Skill Parser Utility

**Files:**
- Create: `src/lib/server/utils/skill-parser.ts`
- Create: `tests/unit/skill-parser.test.ts`

- [ ] **Step 1: Write failing unit tests for skill parser**

Create `tests/unit/skill-parser.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/skill-parser.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the skill parser**

Create `src/lib/server/utils/skill-parser.ts`:

```ts
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
		throw new Error("Invalid SKILL.md: name must be a valid slug (1-64 lowercase alphanumeric + hyphens, no consecutive hyphens, no leading/trailing hyphens)");
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/skill-parser.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Check if `yaml` package is installed**

Run: `npm ls yaml`
If not installed: `npm install yaml`

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/utils/skill-parser.ts tests/unit/skill-parser.test.ts
git commit -m "feat(skills): add SKILL.md parser with Agent Skills spec validation"
```

---

### Task 3: Skills Service

**Files:**
- Create: `src/lib/server/services/skills.ts`
- Create: `tests/integration/skills.test.ts`

- [ ] **Step 1: Write failing integration tests**

Create `tests/integration/skills.test.ts`:

```ts
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
		expect(list).toHaveLength(2);
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/integration/skills.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the skills service**

Create `src/lib/server/services/skills.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/integration/skills.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/services/skills.ts tests/integration/skills.test.ts
git commit -m "feat(skills): add skills service with CRUD operations"
```

---

### Task 4: Agent-Facing Routes

**Files:**
- Create: `src/routes/skills/+server.ts`
- Create: `src/routes/skills/[slug]/+server.ts`
- Modify: `src/hooks.server.ts`

- [ ] **Step 1: Add `/skills/` to public routes in hooks**

In `src/hooks.server.ts`, add `pathname.startsWith("/skills")` to the public routes check. Add it after the `/webhooks/` line:

```ts
pathname.startsWith("/webhooks/") ||
pathname.startsWith("/skills") ||
```

- [ ] **Step 2: Create list + create route**

Create `src/routes/skills/+server.ts`:

```ts
import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireBearer } from "$lib/server/api-auth";
import { listSkills, createSkill } from "$lib/server/services/skills";

export const GET: RequestHandler = async ({ request }) => {
	await requireBearer(request);
	const list = await listSkills();
	return json({ skills: list });
};

export const POST: RequestHandler = async ({ request }) => {
	await requireBearer(request);
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
```

- [ ] **Step 3: Create get + update + delete route**

Create `src/routes/skills/[slug]/+server.ts`:

```ts
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
```

- [ ] **Step 4: Verify routes work manually**

Start the dev server and test with curl (replace `sg_...` with a real token):

```bash
# Create a skill
curl -s -X POST -H "Authorization: Bearer sg_..." \
  -H "Content-Type: application/json" \
  http://localhost:5173/skills \
  -d '{"content": "---\nname: test-skill\ndescription: A test skill.\n---\n\nTest body."}'

# List skills
curl -s -H "Authorization: Bearer sg_..." http://localhost:5173/skills

# Get skill
curl -s -H "Authorization: Bearer sg_..." http://localhost:5173/skills/test-skill

# Delete skill
curl -s -X DELETE -H "Authorization: Bearer sg_..." http://localhost:5173/skills/test-skill
```

- [ ] **Step 5: Commit**

```bash
git add src/routes/skills/+server.ts src/routes/skills/\[slug\]/+server.ts src/hooks.server.ts
git commit -m "feat(skills): add agent-facing skill CRUD routes"
```

---

### Task 5: Admin API Routes

**Files:**
- Create: `src/routes/api/skills/+server.ts`
- Create: `src/routes/api/skills/[slug]/+server.ts`

- [ ] **Step 1: Create admin list + create route**

Create `src/routes/api/skills/+server.ts`:

```ts
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
```

- [ ] **Step 2: Create admin get + update + delete route**

Create `src/routes/api/skills/[slug]/+server.ts`:

```ts
import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireAdmin } from "$lib/server/api-auth";
import { getSkill, updateSkill, deleteSkill } from "$lib/server/services/skills";

export const GET: RequestHandler = async ({ request, params }) => {
	await requireAdmin(request);
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
	await requireAdmin(request);
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
	await requireAdmin(request);
	const deleted = await deleteSkill(params.slug);
	if (!deleted) throw error(404, "Skill not found");
	return json({ ok: true });
};
```

- [ ] **Step 3: Commit**

```bash
git add src/routes/api/skills/+server.ts src/routes/api/skills/\[slug\]/+server.ts
git commit -m "feat(skills): add admin API skill CRUD routes"
```

---

### Task 6: Discovery Extension

**Files:**
- Modify: `src/routes/discovery/+server.ts`

- [ ] **Step 1: Add skills to discovery response**

In `src/routes/discovery/+server.ts`, add the import:

```ts
import { listSkills } from "$lib/server/services/skills";
```

After the webhooks variable assignment, add:

```ts
const skillsList = await listSkills();
```

Update the `return json(...)` to include skills:

```ts
return json({
	targets: filtered,
	webhooks,
	skills: skillsList,
	...(filtered.length === 0 && webhooks.length === 0 && skillsList.length === 0 && {
		message: `No targets, webhooks, or skills are assigned to this API key. Tell the user to go to ${url.origin}/api-keys to add targets, ${url.origin}/webhooks to set up webhooks, or ${url.origin}/skills to manage skills.`,
	}),
});
```

Note: Update the empty-state condition to also check `skillsList.length === 0`.

- [ ] **Step 2: Verify discovery includes skills**

Start dev server and test:

```bash
curl -s -H "Authorization: Bearer sg_..." http://localhost:5173/discovery | jq .skills
```

Expected: `[]` (empty array when no skills exist), or array of `{ slug, description }` objects.

- [ ] **Step 3: Commit**

```bash
git add src/routes/discovery/+server.ts
git commit -m "feat(skills): extend discovery endpoint with skills catalog"
```

---

### Task 7: Gateway Skill Update

**Files:**
- Modify: `src/routes/api/skill/+server.ts`

- [ ] **Step 1: Add skills section to SKILL_MD template**

In `src/routes/api/skill/+server.ts`, add the following section before the `## Rules` section in the `SKILL_MD` constant:

```markdown
## Skills

Shellgate hosts a skill registry with organization-wide skills. At session start, call \`GET /discovery\` — the response includes a \`skills\` array with the name and description of each available skill.

When a task matches a skill description, fetch the full instructions:

\`\`\`bash
curl -s -H "Authorization: Bearer $SHELLGATE_API_KEY" \\
  $SHELLGATE_URL/skills/{skill-slug}
\`\`\`

Returns the full SKILL.md content. Follow the instructions in the skill.

### Managing skills

You can create, update, and delete skills:

\`\`\`bash
# Create a skill (body is raw SKILL.md with YAML frontmatter)
curl -s -X POST -H "Authorization: Bearer $SHELLGATE_API_KEY" \\
  -H "Content-Type: application/json" \\
  $SHELLGATE_URL/skills \\
  -d '{"content": "---\\nname: my-skill\\ndescription: What it does.\\n---\\n\\nInstructions..."}'

# Update a skill
curl -s -X PUT -H "Authorization: Bearer $SHELLGATE_API_KEY" \\
  -H "Content-Type: application/json" \\
  $SHELLGATE_URL/skills/{skill-slug} \\
  -d '{"content": "---\\nname: my-skill\\ndescription: Updated.\\n---\\n\\nNew instructions..."}'

# Delete a skill
curl -s -X DELETE -H "Authorization: Bearer $SHELLGATE_API_KEY" \\
  $SHELLGATE_URL/skills/{skill-slug}
\`\`\`

Skills follow the [Agent Skills](https://agentskills.io) specification. The \`name\` field in frontmatter must be lowercase alphanumeric with hyphens (1-64 chars).
```

- [ ] **Step 2: Verify the updated skill is served**

```bash
curl -s -H "Authorization: Bearer sg_..." http://localhost:5173/api/skill | grep "## Skills"
```

Expected: The new Skills section appears in the output.

- [ ] **Step 3: Commit**

```bash
git add src/routes/api/skill/+server.ts
git commit -m "feat(skills): update gateway skill with registry instructions"
```

---

### Task 8: Dashboard — Skills List Page

**Files:**
- Create: `src/routes/(app)/skills/+page.server.ts`
- Create: `src/routes/(app)/skills/+page.svelte`
- Modify: `src/lib/components/app-sidebar.svelte`

- [ ] **Step 1: Add Skills to sidebar navigation**

In `src/lib/components/app-sidebar.svelte`, add "Skills" to the "Gateway" group items, after "Webhooks":

```ts
{
	title: "Gateway",
	items: [
		{ title: "Targets", url: "/targets" },
		{ title: "Webhooks", url: "/webhooks" },
		{ title: "Skills", url: "/skills" },
	],
},
```

- [ ] **Step 2: Create the page server**

Create `src/routes/(app)/skills/+page.server.ts`:

```ts
import { fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { listSkills, createSkill, deleteSkill } from "$lib/server/services/skills";

export const load: PageServerLoad = async () => {
	const skills = await listSkills();
	return { skills };
};

export const actions = {
	create: async ({ request }) => {
		const data = await request.formData();
		const content = data.get("content")?.toString() ?? "";
		if (!content) return fail(400, { error: "Content is required" });

		try {
			const skill = await createSkill(content);
			return { created: skill };
		} catch (err) {
			return fail(400, { error: err instanceof Error ? err.message : "Failed to create skill" });
		}
	},

	delete: async ({ request }) => {
		const data = await request.formData();
		const slug = data.get("slug")?.toString() ?? "";
		if (!slug) return fail(400, { error: "Slug is required" });

		try {
			const deleted = await deleteSkill(slug);
			if (!deleted) return fail(404, { error: "Skill not found" });
			return { deleted: slug };
		} catch (err) {
			return fail(500, { error: err instanceof Error ? err.message : "Failed to delete" });
		}
	},
} satisfies Actions;
```

- [ ] **Step 3: Create the page component**

Create `src/routes/(app)/skills/+page.svelte`:

```svelte
<script lang="ts">
	import { enhance } from "$app/forms";
	import * as Table from "$lib/components/ui/table/index.js";
	import * as Dialog from "$lib/components/ui/dialog/index.js";
	import { Button } from "$lib/components/ui/button/index.js";
	import { Label } from "$lib/components/ui/label/index.js";
	import * as Breadcrumb from "$lib/components/ui/breadcrumb/index.js";
	import TrashIcon from "@lucide/svelte/icons/trash-2";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import { toast } from "svelte-sonner";

	let { data } = $props();

	type SkillEntry = { slug: string; description: string };

	let localSkills = $state<SkillEntry[] | null>(null);
	let skills = $derived(localSkills ?? data.skills);

	let createOpen = $state(false);
	let createSubmitting = $state(false);
	let createContent = $state("");
	let deleteOpen = $state(false);
	let deleteTarget = $state<SkillEntry | null>(null);
	let deleteSubmitting = $state(false);

	function formatDate(d: string | Date) {
		return new Date(d).toLocaleDateString("en-US", {
			month: "short",
			day: "numeric",
			year: "numeric",
		});
	}
</script>

<div class="flex flex-col gap-6">
	<div>
		<Breadcrumb.Root>
			<Breadcrumb.List>
				<Breadcrumb.Item>
					<Breadcrumb.Link href="/">Shellgate</Breadcrumb.Link>
				</Breadcrumb.Item>
				<Breadcrumb.Separator />
				<Breadcrumb.Item>
					<Breadcrumb.Page>Skills</Breadcrumb.Page>
				</Breadcrumb.Item>
			</Breadcrumb.List>
		</Breadcrumb.Root>
		<h1 class="mt-1 text-2xl font-bold tracking-tight">Skills</h1>
		<p class="text-muted-foreground text-sm">Manage Agent Skills available to all connected agents.</p>
	</div>

	<div class="flex justify-end">
		<Button onclick={() => { createOpen = true; createContent = ""; }}>
			<PlusIcon class="mr-2 size-4" />
			New Skill
		</Button>
	</div>

	{#if skills.length === 0}
		<div class="text-muted-foreground flex flex-col items-center justify-center rounded-lg border border-dashed py-12">
			<p class="text-sm">No skills yet.</p>
			<Button variant="link" onclick={() => { createOpen = true; }}>Create your first skill</Button>
		</div>
	{:else}
		<div class="rounded-lg border">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>Name</Table.Head>
						<Table.Head>Description</Table.Head>
						<Table.Head class="w-[100px]"></Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each skills as skill (skill.slug)}
						<Table.Row>
							<Table.Cell>
								<a href="/skills/{skill.slug}" class="font-medium font-mono text-sm hover:underline">{skill.slug}</a>
							</Table.Cell>
							<Table.Cell class="text-muted-foreground text-sm max-w-md truncate">{skill.description}</Table.Cell>
							<Table.Cell>
								<Button
									variant="ghost"
									size="icon"
									onclick={() => { deleteTarget = skill; deleteOpen = true; }}
								>
									<TrashIcon class="size-4" />
								</Button>
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</div>
	{/if}
</div>

<!-- Create Dialog -->
<Dialog.Root bind:open={createOpen}>
	<Dialog.Content class="sm:max-w-2xl">
		<Dialog.Header>
			<Dialog.Title>New Skill</Dialog.Title>
			<Dialog.Description>Paste SKILL.md content with YAML frontmatter (name + description required).</Dialog.Description>
		</Dialog.Header>
		<form
			method="POST"
			action="?/create"
			use:enhance={() => {
				createSubmitting = true;
				return async ({ result, update }) => {
					createSubmitting = false;
					if (result.type === "success" && result.data?.created) {
						const created = result.data.created as { slug: string; description: string };
						localSkills = [...skills, { slug: created.slug, description: created.description }];
						createOpen = false;
						toast.success("Skill created");
					} else if (result.type === "failure") {
						toast.error((result.data?.error as string) ?? "Failed to create");
					}
					await update({ reset: false, invalidateAll: false });
				};
			}}
		>
			<div class="space-y-4 py-4">
				<div class="space-y-2">
					<Label for="content">SKILL.md Content</Label>
					<textarea
						id="content"
						name="content"
						bind:value={createContent}
						placeholder={"---\nname: my-skill\ndescription: What this skill does.\n---\n\n## Instructions\n\n..."}
						class="border-input bg-background placeholder:text-muted-foreground flex min-h-[200px] w-full rounded-md border px-3 py-2 font-mono text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
						rows="10"
						required
					></textarea>
				</div>
			</div>
			<Dialog.Footer>
				<Button variant="outline" onclick={() => { createOpen = false; }}>Cancel</Button>
				<Button type="submit" disabled={createSubmitting}>
					{createSubmitting ? "Creating..." : "Create"}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>

<!-- Delete Confirmation Dialog -->
<Dialog.Root bind:open={deleteOpen} onOpenChange={(open) => { if (!open) deleteTarget = null; }}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Delete Skill</Dialog.Title>
			<Dialog.Description>
				This will permanently delete <strong>{deleteTarget?.slug}</strong>. This action cannot be undone.
			</Dialog.Description>
		</Dialog.Header>
		<form
			method="POST"
			action="?/delete"
			use:enhance={() => {
				deleteSubmitting = true;
				return async ({ result, update }) => {
					deleteSubmitting = false;
					if (result.type === "success" && result.data?.deleted) {
						localSkills = skills.filter((s) => s.slug !== result.data?.deleted);
						deleteOpen = false;
						toast.success("Skill deleted");
					} else if (result.type === "failure") {
						toast.error((result.data?.error as string) ?? "Failed to delete");
					}
					await update({ reset: false, invalidateAll: false });
				};
			}}
		>
			<input type="hidden" name="slug" value={deleteTarget?.slug ?? ""} />
			<Dialog.Footer>
				<Button variant="outline" onclick={() => { deleteOpen = false; }}>Cancel</Button>
				<Button type="submit" variant="destructive" disabled={deleteSubmitting}>
					{deleteSubmitting ? "Deleting..." : "Delete"}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
```

- [ ] **Step 4: Verify in browser**

Navigate to `http://localhost:5173/skills`. Verify:
- Page loads with empty state
- "Skills" appears in sidebar under Gateway
- Create dialog opens and accepts SKILL.md content

- [ ] **Step 5: Commit**

```bash
git add src/routes/\(app\)/skills/+page.server.ts src/routes/\(app\)/skills/+page.svelte src/lib/components/app-sidebar.svelte
git commit -m "feat(skills): add skills list dashboard page"
```

---

### Task 9: Dashboard — Skill Detail Page

**Files:**
- Create: `src/routes/(app)/skills/[slug]/+page.server.ts`
- Create: `src/routes/(app)/skills/[slug]/+page.svelte`

- [ ] **Step 1: Create the detail page server**

Create `src/routes/(app)/skills/[slug]/+page.server.ts`:

```ts
import { error, fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { getSkill, updateSkill, deleteSkill } from "$lib/server/services/skills";

export const load: PageServerLoad = async ({ params }) => {
	const skill = await getSkill(params.slug);
	if (!skill) throw error(404, "Skill not found");
	return { skill };
};

export const actions = {
	update: async ({ request, params }) => {
		const data = await request.formData();
		const content = data.get("content")?.toString() ?? "";
		if (!content) return fail(400, { error: "Content is required" });

		try {
			const skill = await updateSkill(params.slug, content);
			if (!skill) return fail(404, { error: "Skill not found" });
			return { updated: skill };
		} catch (err) {
			return fail(400, { error: err instanceof Error ? err.message : "Failed to update" });
		}
	},

	delete: async ({ params }) => {
		const deleted = await deleteSkill(params.slug);
		if (!deleted) return fail(404, { error: "Skill not found" });
		return { deleted: params.slug };
	},
} satisfies Actions;
```

- [ ] **Step 2: Create the detail page component**

Create `src/routes/(app)/skills/[slug]/+page.svelte`:

```svelte
<script lang="ts">
	import { enhance } from "$app/forms";
	import { goto } from "$app/navigation";
	import { toast } from "svelte-sonner";
	import { Button } from "$lib/components/ui/button/index.js";
	import { Badge } from "$lib/components/ui/badge/index.js";
	import * as Dialog from "$lib/components/ui/dialog/index.js";
	import * as Breadcrumb from "$lib/components/ui/breadcrumb/index.js";
	import type { PageData } from "./$types";

	let { data }: { data: PageData } = $props();

	let content = $state(data.skill.contentMd);
	let saving = $state(false);
	let deleteOpen = $state(false);
	let deleteSubmitting = $state(false);
	let version = $state(data.skill.version);

	function formatDate(d: string | Date) {
		return new Date(d).toLocaleDateString("en-US", {
			month: "short",
			day: "numeric",
			year: "numeric",
		});
	}
</script>

<div class="flex flex-col gap-6">
	<div>
		<Breadcrumb.Root>
			<Breadcrumb.List>
				<Breadcrumb.Item>
					<Breadcrumb.Link href="/">Shellgate</Breadcrumb.Link>
				</Breadcrumb.Item>
				<Breadcrumb.Separator />
				<Breadcrumb.Item>
					<Breadcrumb.Link href="/skills">Skills</Breadcrumb.Link>
				</Breadcrumb.Item>
				<Breadcrumb.Separator />
				<Breadcrumb.Item>
					<Breadcrumb.Page>{data.skill.slug}</Breadcrumb.Page>
				</Breadcrumb.Item>
			</Breadcrumb.List>
		</Breadcrumb.Root>
		<div class="mt-1 flex items-center gap-3">
			<h1 class="text-2xl font-bold tracking-tight font-mono">{data.skill.slug}</h1>
			<Badge variant="secondary">v{version}</Badge>
		</div>
	</div>

	<!-- Metadata -->
	<div class="rounded-lg border p-6">
		<h2 class="mb-4 text-lg font-semibold">Details</h2>
		<dl class="grid gap-4 sm:grid-cols-3">
			<div>
				<dt class="text-muted-foreground mb-1 text-sm">Description</dt>
				<dd class="text-sm">{data.skill.description}</dd>
			</div>
			<div>
				<dt class="text-muted-foreground mb-1 text-sm">Created</dt>
				<dd class="text-sm">{formatDate(data.skill.createdAt)}</dd>
			</div>
			<div>
				<dt class="text-muted-foreground mb-1 text-sm">Updated</dt>
				<dd class="text-sm">{formatDate(data.skill.updatedAt)}</dd>
			</div>
		</dl>
	</div>

	<!-- Content Editor -->
	<div class="rounded-lg border p-6">
		<h2 class="mb-2 text-lg font-semibold">SKILL.md Content</h2>
		<p class="text-muted-foreground mb-4 text-sm">
			Edit the full SKILL.md content including YAML frontmatter. The name in frontmatter must match the current slug.
		</p>
		<form
			method="POST"
			action="?/update"
			use:enhance={() => {
				saving = true;
				return async ({ result, update }) => {
					saving = false;
					if (result.type === "success" && result.data?.updated) {
						const updated = result.data.updated as typeof data.skill;
						content = updated.contentMd;
						version = updated.version;
						data.skill.description = updated.description;
						data.skill.updatedAt = updated.updatedAt;
						toast.success("Skill updated");
					} else if (result.type === "failure") {
						toast.error((result.data?.error as string) ?? "Failed to update");
					}
					await update({ reset: false, invalidateAll: false });
				};
			}}
		>
			<textarea
				name="content"
				bind:value={content}
				class="border-input bg-background placeholder:text-muted-foreground flex min-h-[300px] w-full rounded-md border px-3 py-2 font-mono text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
				rows="15"
			></textarea>
			<div class="mt-3">
				<Button type="submit" disabled={saving}>
					{saving ? "Saving..." : "Save"}
				</Button>
			</div>
		</form>
	</div>

	<!-- Danger Zone -->
	<div class="rounded-lg border border-destructive/50 p-6">
		<h2 class="mb-2 text-lg font-semibold text-destructive">Danger Zone</h2>
		<p class="text-muted-foreground mb-4 text-sm">Permanently delete this skill. This action cannot be undone.</p>
		<Button variant="destructive" onclick={() => { deleteOpen = true; }}>Delete Skill</Button>
	</div>
</div>

<!-- Delete Confirmation Dialog -->
<Dialog.Root bind:open={deleteOpen}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Delete Skill</Dialog.Title>
			<Dialog.Description>
				This will permanently delete <strong>{data.skill.slug}</strong>. This action cannot be undone.
			</Dialog.Description>
		</Dialog.Header>
		<form
			method="POST"
			action="?/delete"
			use:enhance={() => {
				deleteSubmitting = true;
				return async ({ result, update }) => {
					deleteSubmitting = false;
					if (result.type === "success" && result.data?.deleted) {
						toast.success("Skill deleted");
						goto("/skills");
					} else if (result.type === "failure") {
						toast.error((result.data?.error as string) ?? "Failed to delete");
					}
					await update({ reset: false, invalidateAll: false });
				};
			}}
		>
			<Dialog.Footer>
				<Button variant="outline" onclick={() => { deleteOpen = false; }}>Cancel</Button>
				<Button type="submit" variant="destructive" disabled={deleteSubmitting}>
					{deleteSubmitting ? "Deleting..." : "Delete"}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
```

- [ ] **Step 3: Verify in browser**

Create a skill via the list page, then click through to the detail page. Verify:
- Metadata displays correctly
- Content editor shows full SKILL.md
- Save updates the content and increments version badge
- Delete redirects back to `/skills`

- [ ] **Step 4: Commit**

```bash
git add src/routes/\(app\)/skills/\[slug\]/+page.server.ts src/routes/\(app\)/skills/\[slug\]/+page.svelte
git commit -m "feat(skills): add skill detail dashboard page"
```

---

### Task 10: Manual Verification with Playwright

**Files:** None (manual verification only)

- [ ] **Step 1: Start dev server**

Run: `npm run dev`

- [ ] **Step 2: Use Playwright MCP to verify dashboard**

Walk through the full flow in the browser:
1. Navigate to `/skills` — verify empty state
2. Click "New Skill" — create a skill with valid SKILL.md content
3. Verify skill appears in the table
4. Click the skill name — navigate to detail page
5. Edit content in textarea, click Save — verify version increments
6. Click Delete — verify redirect to `/skills` and skill is gone
7. Check sidebar — "Skills" appears under Gateway

- [ ] **Step 3: Verify agent-facing API via curl**

```bash
# Create
curl -s -X POST -H "Authorization: Bearer sg_..." \
  -H "Content-Type: application/json" \
  http://localhost:5173/skills \
  -d '{"content": "---\nname: test-api\ndescription: Test via API.\n---\n\nBody."}'

# Discovery includes skills
curl -s -H "Authorization: Bearer sg_..." http://localhost:5173/discovery | jq .skills

# Get full content
curl -s -H "Authorization: Bearer sg_..." http://localhost:5173/skills/test-api

# Update
curl -s -X PUT -H "Authorization: Bearer sg_..." \
  -H "Content-Type: application/json" \
  http://localhost:5173/skills/test-api \
  -d '{"content": "---\nname: test-api\ndescription: Updated.\n---\n\nNew body."}'

# Delete
curl -s -X DELETE -H "Authorization: Bearer sg_..." http://localhost:5173/skills/test-api
```

- [ ] **Step 4: Verify gateway skill includes new section**

```bash
curl -s -H "Authorization: Bearer sg_..." http://localhost:5173/api/skill | grep -A5 "## Skills"
```

- [ ] **Step 5: Run all tests**

```bash
npx vitest run
```

Expected: All existing tests still pass, new tests pass.
