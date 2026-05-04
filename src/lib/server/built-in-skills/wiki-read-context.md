---
name: wiki-read-context
description: Use when you need background knowledge before starting a task. Searches wiki for relevant pages and loads context.
---

# Wiki Read Context

Load relevant organizational knowledge before starting work.

## When to Use

- Before any task that involves a specific domain (SEO, brand, architecture, etc.)
- When you need to understand prior decisions or analysis
- When the user references something that might be documented

## Steps

1. Call `wiki_list_pages` to see all available pages
2. Scan titles, tags, and summaries for relevance to your current task
3. Call `wiki_read_page` for each relevant page (max 3-5 pages)
4. Use the loaded knowledge to inform your work

## Rules

- Read before you act — don't skip this step
- Prefer wiki over guessing or relying on training data for org-specific knowledge
- If you find outdated info, flag it but don't update during a read-context flow
- Don't read every page — scan the index and pick what's relevant
