# Wiki V1: Centraal Karpathy-gebaseerd kennissysteem

**Ticket:** DEA-4125
**Datum:** 2026-05-04
**Status:** Design approved

## Doel

Centrale wiki module toevoegen aan Shellgate als derde kennislaag naast Skills (procedureel) en Memories (gedragssturing). De wiki bevat gecompileerde organisatiekennis op basis van het Karpathy LLM Wiki v1 patroon.

## Functiescheiding

| Systeem  | Vraag                          | Voorbeeld                                      |
|----------|--------------------------------|-------------------------------------------------|
| **Wiki** | *Wat weten we hierover?*       | SEO analyse, architectuurdocs, beslissingen     |
| **Memory** | *Hoe moet ik me gedragen?*   | "Focus content op New Balance, niet Nike"       |
| **Skill** | *Welke stappen moet ik volgen?* | "Zo voer je een Semrush analyse uit"          |

## Beslissingen

- **Org-scoped** (zoals skills) — geen token/user visibility levels
- **Sources als JSONB** kolom op wiki_pages, niet als aparte tabel
- **Benadering A:** Skills-patroon volgen, geen revision history (V2)
- **Readonly dashboard** pagina, vergelijkbaar met /memories

## Data Model

### Tabel: `wiki_pages`

| Kolom       | Type                  | Constraints                    |
|-------------|-----------------------|--------------------------------|
| id          | uuid                  | PK, auto                      |
| namespace   | varchar(64)           | NOT NULL, DEFAULT 'general'    |
| slug        | varchar(128)          | NOT NULL                       |
| title       | varchar(256)          | NOT NULL                       |
| summary     | varchar(500)          | nullable                       |
| tags        | jsonb (string[])      | DEFAULT '[]'                   |
| body        | text                  | NOT NULL (markdown)            |
| sources     | jsonb (WikiSourceRef[]) | DEFAULT '[]'                 |
| status      | varchar(16)           | NOT NULL, DEFAULT 'active'     |
| version     | integer               | NOT NULL, DEFAULT 1            |
| updated_by  | varchar(128)          | nullable (token name)          |
| created_at  | timestamp with tz     | NOT NULL, DEFAULT now()        |
| updated_at  | timestamp with tz     | NOT NULL, DEFAULT now()        |

**Constraints:**
- UNIQUE(namespace, slug)
- INDEX(namespace)
- INDEX(status)

### WikiSourceRef (JSONB shape)

```ts
type WikiSourceRef = {
  type: 'url' | 'file' | 'mcp' | 'manual' | 'semrush'
  title?: string
  uri?: string
  retrievedAt?: string
}
```

Sources worden bij elke upsert volledig overschreven (geen merge).

### Optimistic Concurrency

`wiki_upsert_page` accepteert `expectedVersion`:
- Create: expectedVersion wordt genegeerd, version start op 1
- Update: expectedVersion moet matchen, anders → version conflict error

## MCP Tools

Vijf tools, allemaal org-scoped. Token wordt doorgegeven voor `updatedBy` (token.name).

### `wiki_list_pages`

- **Args:** `namespace?`, `status?` (default: alleen 'active'), `tag?`
- **Returns:** `[{ slug, title, namespace, tags, summary, status, version, updatedAt, updatedBy }]`
- Geen body in response
- Limit: 200 resultaten, gesorteerd op updatedAt desc

### `wiki_read_page`

- **Args:** `namespace?` (default 'general'), `slug`
- **Returns:** Volledig object inclusief body, sources, version
- Lookup via unique constraint (namespace, slug)
- Niet gevonden → `{ error: "Page not found" }`

### `wiki_upsert_page`

- **Args:** `namespace?`, `slug`, `title`, `body`, `summary?`, `tags?`, `sources?`, `status?`, `expectedVersion?`
- **Create:** page bestaat niet → version=1, expectedVersion genegeerd
- **Update:** page bestaat EN expectedVersion matcht → version+1
- **Conflict:** expectedVersion mismatch → `{ error: "Version conflict: expected X, found Y" }`
- Slug validatie: `^[a-z0-9]([a-z0-9-]*[a-z0-9])?$`
- **Returns:** `{ slug, namespace, version, updatedAt }`

### `wiki_delete_page`

- **Args:** `namespace?`, `slug`
- Soft delete: zet status naar 'archived'
- Al archived → `{ error: "Page not found or already archived" }`
- **Returns:** `{ archived: true, slug }`

### `wiki_lint_page`

- **Args:** (`namespace?`, `slug`) OF (`body`, `title`, `sources?`) — lint bestaand of direct
- **Checks:**
  1. Title aanwezig en niet leeg
  2. Body niet leeg, max 50.000 chars
  3. Sources: elk heeft `type`; `uri` verplicht bij url/mcp/semrush types
  4. Grenscontrole: memory-achtige content → warning; skill-achtige content → warning
  5. Broken `[[slug]]` referenties → warning
- **Returns:** `{ valid: boolean, warnings: string[], errors: string[] }`

Grenscontrole is bewust licht — warnings, geen harde errors.

## Service Layer

### File: `src/lib/server/services/wiki.ts`

Volgt het skills-patroon (org-scoped, geen token access control):

- `listWikiPages(filters?)` — query met optionele namespace/status/tag filters
- `getWikiPage(namespace, slug)` — single page of `null`
- `upsertWikiPage(input)` — create of update met optimistic concurrency
- `archiveWikiPage(namespace, slug)` — soft delete
- `lintWikiPage(input)` — validatie, returns `{ valid, warnings, errors }`

### File: `src/lib/server/mcp/tools/wiki.ts`

Vijf functies die de service aanroepen. Token alleen voor `updatedBy: token.name`. Zelfde error-patroon als skills.

### Server registratie: `src/lib/server/mcp/server.ts`

Vijf `server.tool()` calls + cases in `createMcpToolHandler`.

## Discover & Instructions

### Discover uitbreiden

`wikiPageCount` toevoegen aan discover response:
```ts
return { targets, webhooks, skills, memoryCount, wikiPageCount };
```

### MCP Instructions updaten

Server instructions aanvullen met wiki-beschikbaarheid en functiescheiding (Weten → Wiki, Gedragen → Memory, Doen → Skill).

## Dashboard

### Route: `/wiki` (readonly)

```
src/routes/(app)/wiki/+page.server.ts   — load: listWikiPages()
src/routes/(app)/wiki/+page.svelte      — tabel + detail view
```

- Tabel: namespace, title, tags, status, version, updatedBy, updatedAt
- Filters: namespace, status
- Detail view: klik voor volledige body (markdown rendered) + sources
- Geen form actions — puur readonly

## Testing

Diamond model: integration-zwaar, minimal unit.

### Integration tests: `tests/integration/wiki.test.ts`

- Upsert create: nieuwe pagina → version 1
- Upsert update: correcte expectedVersion → version+1
- Optimistic concurrency: verkeerde expectedVersion → error
- Archive: soft delete → status 'archived'
- Archive archived page → error
- List met filters: namespace, status, tag
- Read bestaande pagina → volledig object
- Read niet-bestaande pagina → null
- Unique constraint: zelfde namespace+slug → upsert, niet duplicate

### Unit tests: `tests/unit/wiki-lint.test.ts`

- Lege body → error
- Body > 50.000 chars → error
- Source zonder type → error
- Broken `[[slug]]` links → warning
- Grenscontrole memory/skill content → warning

## Wat we NIET bouwen (V1)

- Geen revision history
- Geen knowledge graph
- Geen vector search / embeddings
- Geen automatische memory-extractie uit wiki
- Geen confidence scoring of forgetting curves
- Geen real-time collaborative editing
- Geen create/edit/delete in dashboard UI
- Geen REST API routes (alleen MCP)
- Geen GIN index op tags (klein aantal pages)
