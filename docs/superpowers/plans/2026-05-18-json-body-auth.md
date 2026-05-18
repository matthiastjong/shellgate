# json_body Auth Method Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `json_body` auth method type that merges stored JSON credentials into the request body at the gateway.

**Architecture:** New auth type `json_body` — stored as raw JSON string in `credential` column. Gateway parses it and merges into the request body (stored fields override agent fields). UI uses a raw JSON textarea.

**Tech Stack:** SvelteKit, Drizzle ORM, Vitest + Testcontainers

---

### Task 1: Add `json_body` to auth-methods service

**Files:**
- Modify: `src/lib/server/services/auth-methods.ts:5` (VALID_TYPES)
- Modify: `src/lib/server/services/auth-methods.ts:6-47` (computeCredentialHint)

- [ ] **Step 1: Add `json_body` to VALID_TYPES**

In `src/lib/server/services/auth-methods.ts`, change line 5:

```typescript
const VALID_TYPES = ["bearer", "basic", "custom_header", "query_param", "ssh_key", "jwt_es256", "oauth2_refresh_token", "json_body"];
```

- [ ] **Step 2: Add credential hint for `json_body`**

In `src/lib/server/services/auth-methods.ts`, add a new block after the `oauth2_refresh_token` hint block (after line 43), before the generic fallback:

```typescript
if (type === "json_body") {
	try {
		const parsed = JSON.parse(credential);
		const keys = Object.keys(parsed);
		if (keys.length === 0) return "JSON Body (empty)";
		return `keys: ${keys.join(", ")}`;
	} catch {
		return "JSON Body (invalid)";
	}
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/server/services/auth-methods.ts
git commit -m "feat: add json_body to auth method VALID_TYPES and credential hint"
```

---

### Task 2: Add gateway body merge logic

**Files:**
- Modify: `src/lib/server/services/gateway.ts:61-212` (proxyToTarget function)

- [ ] **Step 1: Write the failing integration test**

In `tests/integration/gateway.test.ts`, add after the last test (before the closing `});`):

```typescript
it("proxies request with json_body credential merged into request body", async () => {
	const { token: tokenRow } = await createTestToken();
	const target = await createTestTarget("GoCardlessAPI", "https://bankaccountdata.gocardless.com");
	const storedBody = JSON.stringify({ secret_id: "my-secret-id", secret_key: "my-secret-key" });
	await createTestAuthMethod(target.id, { type: "json_body", credential: storedBody });
	await grantPermission(tokenRow.id, target.id);

	const fullToken = await getFullToken(tokenRow.id);

	const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ access: "token123" }));

	const request = new Request(`http://localhost/gateway/${target.slug}/api/v2/token/new/`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({}),
	});

	const response = await proxyRequest(fullToken, target.slug, "api/v2/token/new/", request);

	expect(response.status).toBe(200);
	expect(fetchSpy).toHaveBeenCalledOnce();
	const [, init] = fetchSpy.mock.calls[0];

	// Read the body that was sent upstream
	const sentBody = await new Response(init!.body).json();
	expect(sentBody).toEqual({ secret_id: "my-secret-id", secret_key: "my-secret-key" });

	// Content-Type should be set to application/json
	expect((init!.headers as Headers).get("Content-Type")).toBe("application/json");
});

it("json_body merges with agent-supplied body fields (stored wins)", async () => {
	const { token: tokenRow } = await createTestToken();
	const target = await createTestTarget("MergeAPI", "https://api.merge.com");
	const storedBody = JSON.stringify({ api_key: "secret-123" });
	await createTestAuthMethod(target.id, { type: "json_body", credential: storedBody });
	await grantPermission(tokenRow.id, target.id);

	const fullToken = await getFullToken(tokenRow.id);

	const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ ok: true }));

	const request = new Request(`http://localhost/gateway/${target.slug}/data`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ query: "test", api_key: "agent-tried-to-override" }),
	});

	const response = await proxyRequest(fullToken, target.slug, "data", request);

	expect(response.status).toBe(200);
	const [, init] = fetchSpy.mock.calls[0];
	const sentBody = await new Response(init!.body).json();
	expect(sentBody).toEqual({ query: "test", api_key: "secret-123" });
});

it("json_body works with empty/no agent body", async () => {
	const { token: tokenRow } = await createTestToken();
	const target = await createTestTarget("EmptyBodyAPI", "https://api.emptybody.com");
	const storedBody = JSON.stringify({ token: "abc" });
	await createTestAuthMethod(target.id, { type: "json_body", credential: storedBody });
	await grantPermission(tokenRow.id, target.id);

	const fullToken = await getFullToken(tokenRow.id);

	const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ ok: true }));

	const request = new Request(`http://localhost/gateway/${target.slug}/action`, {
		method: "POST",
	});

	const response = await proxyRequest(fullToken, target.slug, "action", request);

	expect(response.status).toBe(200);
	const [, init] = fetchSpy.mock.calls[0];
	const sentBody = await new Response(init!.body).json();
	expect(sentBody).toEqual({ token: "abc" });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/integration/gateway.test.ts`
Expected: 3 new tests FAIL (json_body not handled in gateway)

- [ ] **Step 3: Implement body merge in gateway**

In `src/lib/server/services/gateway.ts`, add a new `else if` block after the `oauth2_refresh_token` block (after line 167), inside the `if (authMethod)` block:

```typescript
} else if (authMethod.type === "json_body") {
	try {
		const storedFields = JSON.parse(authMethod.credential);
		let agentBody: Record<string, unknown> = {};
		if (request.method !== "GET" && request.method !== "HEAD") {
			try {
				const cloned = request.clone();
				const text = await cloned.text();
				if (text) agentBody = JSON.parse(text);
			} catch { /* non-JSON or empty body — use empty object */ }
		}
		const mergedBody = JSON.stringify({ ...agentBody, ...storedFields });
		headers.set("Content-Type", "application/json");

		// Override the fetch call to use merged body
		console.log("[gateway] →", request.method, url.toString());
		console.log("[gateway] → headers:", Object.fromEntries(headers.entries()));

		let upstreamResponse: Response;
		try {
			upstreamResponse = await fetch(url.toString(), {
				method: request.method,
				headers,
				body: mergedBody,
				// @ts-expect-error duplex needed for streaming body
				duplex: "half",
			});
		} catch (err) {
			console.error("[gateway] ✗ upstream request failed:", err);
			return Response.json({ error: "upstream request failed" }, { status: 502 });
		}

		console.log("[gateway] ←", upstreamResponse.status, url.toString());
		console.log("[gateway] ← headers:", Object.fromEntries(upstreamResponse.headers.entries()));

		const responseHeaders = new Headers();
		for (const [key, value] of upstreamResponse.headers.entries()) {
			const lower = key.toLowerCase();
			if (lower === "transfer-encoding" || lower === "content-encoding") continue;
			responseHeaders.set(key, value);
		}

		const body = await upstreamResponse.arrayBuffer();
		responseHeaders.set("Content-Length", String(body.byteLength));

		return new Response(body, {
			status: upstreamResponse.status,
			headers: responseHeaders,
		});
	} catch (err) {
		console.error("[gateway] ✗ json_body merge failed:", err);
		return Response.json({ error: "json_body merge failed" }, { status: 500 });
	}
}
```

**Important:** The `json_body` block needs to return early (before the normal fetch at line 176) because it replaces the body. The block includes its own fetch + response handling, returning directly.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/integration/gateway.test.ts`
Expected: All tests PASS including the 3 new ones

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/services/gateway.ts tests/integration/gateway.test.ts
git commit -m "feat: add json_body gateway support — merge stored JSON into request body"
```

---

### Task 3: Add UI form fields for json_body

**Files:**
- Modify: `src/lib/components/auth-method-fields.svelte`

- [ ] **Step 1: Add `json_body` option to the type dropdown**

In `src/lib/components/auth-method-fields.svelte`, add after the `oauth2_refresh_token` option (line 50):

```svelte
<option value="json_body">JSON Body</option>
```

- [ ] **Step 2: Add textarea field for json_body**

Add a new `{:else if}` block before the final `{:else}` block (before line 251):

```svelte
{:else if authType === 'json_body'}
	<div class="grid gap-2">
		<Label for="{idPrefix}-credential">JSON Body{#if mode === 'edit'} <span class="text-muted-foreground text-xs">{optionalHint}</span>{/if}</Label>
		<textarea
			id="{idPrefix}-credential"
			name="credential"
			class="flex min-h-[120px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring font-mono"
			bind:value={authCredential}
			placeholder={'{"secret_id": "your-id", "secret_key": "your-key"}'}
			required={mode === 'add'}
		></textarea>
		<p class="text-xs text-muted-foreground">Raw JSON object. These fields will be merged into the request body.</p>
	</div>
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/auth-method-fields.svelte
git commit -m "feat: add json_body UI fields in auth method form"
```

---

### Task 4: Add form parsing for json_body

**Files:**
- Modify: `src/routes/(app)/targets/[slug]/+page.server.ts`

- [ ] **Step 1: Add json_body parsing in addAuthMethod action**

In `+page.server.ts`, in the `addAuthMethod` action, add a new `else if` block before the final `else` block (before line 171):

```typescript
} else if (type === "json_body") {
	credential = data.get("credential")?.toString() ?? "";
	if (!credential) return fail(400, { error: "JSON body is required" });
	try {
		const parsed = JSON.parse(credential);
		if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
			return fail(400, { error: "JSON body must be a JSON object" });
		}
	} catch {
		return fail(400, { error: "Invalid JSON" });
	}
```

- [ ] **Step 2: Add json_body parsing in editAuthMethod action**

In `+page.server.ts`, in the `editAuthMethod` action, add a new `else if` block before the final `else` block (before line 279):

```typescript
} else if (type === "json_body") {
	const raw = data.get("credential")?.toString() ?? "";
	if (raw) {
		try {
			const parsed = JSON.parse(raw);
			if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
				return fail(400, { error: "JSON body must be a JSON object" });
			}
			credential = raw;
		} catch {
			return fail(400, { error: "Invalid JSON" });
		}
	}
```

- [ ] **Step 3: Commit**

```bash
git add src/routes/(app)/targets/[slug]/+page.server.ts
git commit -m "feat: add json_body form parsing with JSON validation"
```

---

### Task 5: Update AGENTS.md documentation

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 1: Add json_body to auth method types list**

In `AGENTS.md`, find the line that says:

```
- Auth method types: `bearer`, `basic`, `custom_header`, `ssh_key`.
```

Replace with:

```
- Auth method types: `bearer`, `basic`, `custom_header`, `query_param`, `ssh_key`, `jwt_es256`, `oauth2_refresh_token`, `json_body`.
```

- [ ] **Step 2: Commit**

```bash
git add AGENTS.md
git commit -m "docs: add json_body to auth method types in AGENTS.md"
```

---

### Task 6: Final verification

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 2: Start dev server and verify UI**

Run: `npm run dev`
Navigate to a target's detail page, click "Add auth method", verify `JSON Body` appears in the type dropdown and shows the textarea when selected.
