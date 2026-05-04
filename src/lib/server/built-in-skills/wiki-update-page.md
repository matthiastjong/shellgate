---
name: wiki-update-page
description: Use when you have new information that should be added to an existing wiki page. Handles the read-modify-write cycle with optimistic concurrency.
---

# Wiki Update Page

Enrich an existing wiki page with new information using the write-back pattern.

## When to Use

- You've completed research or analysis that updates existing knowledge
- A user provides new facts that belong in an existing wiki page
- You notice outdated information while reading a page

## Write-Back Pattern (mandatory)

1. `wiki_read_page` — load the current version (note the `version` number)
2. Analyze: what sections need updating? What's new vs what's already there?
3. **Rewrite** affected sections — don't append. The page should read as a coherent, current document
4. Update `sources` array with any new sources used
5. `wiki_lint_page` — validate before writing
6. `wiki_upsert_page` with `expectedVersion` set to the version you read

## Rules

- **Rewrite, don't append.** "Last updated: ..." headers and changelog sections are forbidden. The page should always read as the current truth.
- **Preserve structure.** Keep the existing heading hierarchy. Add sections if needed, but don't reorganize without good reason.
- **Update sources.** Every claim should be traceable. Add new source refs, remove sources for content you deleted.
- **Use optimistic concurrency.** Always pass `expectedVersion`. If you get a version conflict, re-read and retry.
- **One topic per page.** If your update introduces a new major topic, consider `wiki-create-page` instead.

## Boundary Check

Before updating, verify the content belongs in the wiki:
- Behavioral instructions ("always do X", "prefer Y over Z") → **memory**, not wiki
- Step-by-step procedures ("Step 1: ..., Step 2: ...") → **skill**, not wiki
- Factual knowledge, analysis, decisions, context → **wiki**
