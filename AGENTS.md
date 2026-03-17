# Development Guidelines

## Architecture
- **Services** (`src/lib/server/services/`) contain all business logic
- **Routes** (`src/routes/api/`) are thin wrappers that call services
- **Dashboard pages** call services directly (no HTTP to self)
- **DB** uses lazy proxy pattern — setting `DATABASE_URL` before first access is sufficient

## Testing Philosophy

We follow the **diamond model**: few unit tests, strong integration tests, minimal e2e.

### What to test
- **Business logic with real consequences:** gateway proxy flow, cascade deletes, default-auth-method toggling, permission uniqueness
- **Edge cases in pure functions:** already covered in `tests/unit/`

### What NOT to test
- Simple CRUD that just verifies Drizzle can INSERT + SELECT
- Route handlers (they're thin wrappers around services)
- UI components (too fragile, too much overhead)

### How to test
- Integration tests run against a real Postgres via **Testcontainers**
- Only mock `globalThis.fetch` (for upstream API calls in gateway tests)
- Never mock the database
- Each test gets a clean state (`truncateAll` in `beforeEach`)
- Target: ~15 focused integration tests, not 50 superficial ones

### Test structure
```
tests/
  setup.ts              ← Testcontainers global setup
  helpers.ts            ← Factory functions + truncateAll
  unit/                 ← Pure function tests (existing)
  integration/          ← Service tests against real DB
```

## Code Patterns
- Forms use `use:enhance` with `invalidateAll: false` + local state updates
- Date types from Drizzle are `string | Date` — handle both in components
- Use `formatDate` (absolute) for SSR-safe rendering
- Service functions return `null` for not-found (not throw)
- API routes throw `error(404, ...)` for not-found
