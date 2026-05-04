---
name: wiki-compile-research
description: Use when you have raw research data (Semrush exports, API responses, transcripts) that should be compiled into a wiki knowledge document.
---

# Wiki Compile Research

Transform raw data into a living wiki document. This is the core Karpathy wiki pattern — compile, don't copy.

## When to Use

- Semrush SEO data arrived and needs analysis
- API responses contain insights worth preserving
- Meeting notes or transcripts need to become structured knowledge
- Multiple data sources need synthesis into one coherent document

## Process

### 1. Gather Raw Data

Collect all relevant data sources. For each source, note:
- What type it is (`semrush`, `url`, `mcp`, `file`, `manual`)
- Where it came from (URI if applicable)
- When it was retrieved

### 2. Check Existing Knowledge

```
wiki_list_pages → find related pages
wiki_read_page → load existing analysis (if any)
```

If an existing page covers this topic → this is an **update**, not a create. Use `wiki-update-page` skill and merge new data into the existing document.

### 3. Analyze and Synthesize

This is where the LLM adds value. Don't just dump raw data — compile it:

- **Extract insights.** What does the data tell us?
- **Compare with prior state.** What changed since last analysis?
- **Identify trends.** What patterns emerge?
- **Note anomalies.** What's unexpected?
- **Draw conclusions.** What should we do differently?

### 4. Write the Document

Structure for compiled research:

```markdown
## Overview

Key findings in 2-3 sentences.

## Analysis

Detailed findings organized by theme, not by data source.

## Changes Since Last Analysis

What's different from the previous version (if updating).

## Raw Data Summary

Condensed reference data (tables, key metrics) — not the full export.
```

### 5. Validate and Save

```
wiki_lint_page → check structure and boundaries
wiki_upsert_page → save with sources and tags
```

## Rules

- **Compile, don't copy.** Raw data dumps are not wiki pages. Analyze and synthesize.
- **Write-back, don't append.** If updating an existing page, rewrite sections with current analysis. The page should read as current truth, not a changelog.
- **Attribute sources.** Every wiki page from compiled research must have source refs with `retrievedAt` timestamps.
- **Use absolute dates.** "Traffic grew 15% in Q1 2026", not "traffic grew 15% recently".
- **Keep raw data separate.** The wiki page is the analysis. If someone needs the raw export, point to where it's stored.
