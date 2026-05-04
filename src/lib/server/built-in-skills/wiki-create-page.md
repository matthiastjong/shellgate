---
name: wiki-create-page
description: Use when creating a new wiki knowledge document. Guides structure, namespace selection, and source attribution.
---

# Wiki Create Page

Create a new wiki page for organizational knowledge that doesn't exist yet.

## When to Use

- You've gathered knowledge on a new topic that should be documented
- A user asks you to document something
- You've completed research that deserves its own page

## Before Creating

1. `wiki_list_pages` — check if a page on this topic already exists
2. If similar page exists → use `wiki-update-page` instead
3. Verify content belongs in wiki (not memory or skill)

## Page Structure

Every wiki page should follow this general structure:

```markdown
## Overview

One paragraph summary of the topic.

## [Main Sections]

Organized by topic, not by date. Use clear headings.

## Key Decisions

If applicable, document decisions made and their rationale.
```

## Choosing Namespace and Slug

- **Namespace:** Group related pages. Examples: `sneakerbaron`, `luieraanbiedingen`, `infrastructure`, `general`
- **Slug:** Descriptive, lowercase, hyphenated. Examples: `seo-q1-2026`, `brand-positioning`, `deployment-architecture`
- Use `general` namespace for cross-cutting topics

## Required Fields

- `title` — clear, descriptive title
- `body` — well-structured markdown
- `tags` — 2-5 tags for discoverability
- `sources` — at least one source reference (even if `type: "manual"`)

## Rules

- **One topic per page.** Don't create mega-documents. Better to have many focused pages than few sprawling ones.
- **Write for future readers.** Another agent (or you in 3 months) should understand this page without external context.
- **No temporal language.** Avoid "recently", "last week", "currently". Use absolute dates if needed.
- **Always lint.** Run `wiki_lint_page` before saving.
- **Set status correctly.** Use `draft` if incomplete, `active` when ready.
