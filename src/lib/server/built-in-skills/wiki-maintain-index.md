---
name: wiki-maintain-index
description: Periodic wiki maintenance. Check for orphaned pages, stale content, broken links, and index consistency.
---

# Wiki Maintain Index

Run periodic maintenance on the wiki to keep it healthy and useful.

## When to Use

- Periodically (e.g., weekly scheduled task)
- After a batch of wiki changes
- When a user asks to clean up the wiki
- Before a major knowledge compilation session

## Maintenance Steps

### 1. Full Index Scan

```
wiki_list_pages(status: "all") → get complete page list including drafts and archived
```

### 2. Lint All Active Pages

For each active page:
```
wiki_lint_page(slug: "<slug>") → check for structural issues
```

Collect all warnings and errors.

### 3. Check for Issues

| Issue | Detection | Action |
|-------|-----------|--------|
| **Broken links** | Lint warnings about `[[slug]]` references | Fix or remove broken links |
| **Stale pages** | `updatedAt` older than 90 days | Flag for review, don't archive automatically |
| **Orphaned pages** | No other page links to this page AND no recent reads | Flag for review |
| **Boundary violations** | Lint warns about memory/skill content | Flag for manual review |
| **Draft pages** | Status is `draft` for >30 days | Ask if they should be completed or archived |
| **Empty tags** | Pages with no tags | Suggest tags based on content |

### 4. Report Findings

Produce a summary:
- Total pages (active / draft / archived)
- Issues found (by category)
- Suggested actions
- Pages flagged for human review

### 5. Auto-Fix Safe Issues

Only auto-fix issues that are clearly safe:
- Fix broken links where the target was renamed (if obvious)
- Add missing tags based on namespace and title

For anything ambiguous, report it and let a human decide.

## Rules

- **Never auto-archive.** Only humans decide to archive pages.
- **Never auto-delete.** Wiki uses soft delete (archive) only.
- **Report, don't assume.** When in doubt, flag for human review.
- **Batch lint calls.** Don't lint pages one by one if you can check slugs against the index directly.
