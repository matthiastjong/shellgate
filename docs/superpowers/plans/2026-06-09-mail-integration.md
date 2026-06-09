# Mail Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Shellgate agents full email access (search, read, send, draft, folders, move, flag, attachments) via ImapFlow + Nodemailer built directly into Shellgate.

**Architecture:** New target type `email` with IMAP/SMTP config stored in existing `config` JSONB column. New `mail` service handles all IMAP/SMTP connections. New `/mail/[target]/` routes and 8 MCP tools expose the functionality. Dashboard gets tabbed target list and email-specific forms.

**Tech Stack:** ImapFlow (IMAP), Nodemailer (SMTP), SvelteKit routes, Drizzle ORM, shadcn-svelte Tabs

**Spec:** `docs/superpowers/specs/2026-06-09-mail-integration-design.md`

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/server/db/schema.ts` | Add `EmailConfig` type, `email` column, extend type unions |
| `src/lib/server/services/targets.ts` | Extend create/update for email type + validation |
| `src/lib/server/services/auth-methods.ts` | Add `imap_smtp` type + credential hint |
| `src/lib/server/services/audit.ts` | Add `"mail"` to type union |
| `src/lib/server/services/mail.ts` | **New** — all IMAP/SMTP logic (search, read, send, draft, folders, move, flag, attachment) |
| `src/routes/mail/[target]/search/+server.ts` | **New** — POST search endpoint |
| `src/routes/mail/[target]/message/[id]/+server.ts` | **New** — GET read endpoint |
| `src/routes/mail/[target]/message/[id]/attachment/[partId]/+server.ts` | **New** — GET attachment endpoint |
| `src/routes/mail/[target]/send/+server.ts` | **New** — POST send endpoint |
| `src/routes/mail/[target]/draft/+server.ts` | **New** — POST draft endpoint |
| `src/routes/mail/[target]/folders/+server.ts` | **New** — GET folders endpoint |
| `src/routes/mail/[target]/move/+server.ts` | **New** — POST move endpoint |
| `src/routes/mail/[target]/flag/+server.ts` | **New** — POST flag endpoint |
| `src/lib/server/mcp/tools/mail.ts` | **New** — all 8 MCP mail tool handlers |
| `src/lib/server/mcp/server.ts` | Register 8 mail tools + import |
| `src/lib/server/mcp/tools/bootstrap.ts` | Add `email` field for email targets |
| `src/hooks.server.ts` | Add `/mail/` to auth bypass list |
| `src/routes/(app)/targets/+page.server.ts` | Add email type to create action |
| `src/routes/(app)/targets/+page.svelte` | Tabbed target list + email create form |
| `src/routes/(app)/targets/[slug]/+page.server.ts` | Add email config update action |
| `src/routes/(app)/targets/[slug]/+page.svelte` | Email config display + edit |

---

### Task 1: Install dependencies and extend schema

**Files:**
- Modify: `package.json`
- Modify: `src/lib/server/db/schema.ts:33-53,107-136`
- Modify: `src/lib/server/services/audit.ts:4-17`

- [ ] **Step 1: Install ImapFlow and Nodemailer**

```bash
npm install imapflow nodemailer
npm install -D @types/nodemailer
```

- [ ] **Step 2: Add EmailConfig type and extend schema**

In `src/lib/server/db/schema.ts`, after the `SshConfig` type (line 37), add:

```typescript
export type EmailConfig = {
	imap: { host: string; port: number; secure: boolean };
	smtp: { host: string; port: number; secure: boolean };
};
```

Update line 43 — change the type union:

```typescript
type: text("type").notNull().$type<"api" | "ssh" | "email">(),
```

Update line 45 — extend config type:

```typescript
config: jsonb("config").$type<SshConfig | EmailConfig>(),
```

Add `email` column after `config` (after line 45):

```typescript
email: varchar("email", { length: 255 }),
```

Update line 119 — extend audit log type:

```typescript
type: text("type").notNull().$type<"gateway" | "ssh" | "vault" | "mail">(),
```

- [ ] **Step 3: Update audit service type**

In `src/lib/server/services/audit.ts`, update line 9:

```typescript
type: "gateway" | "ssh" | "vault" | "mail";
```

- [ ] **Step 4: Generate migration**

```bash
npm run db:generate
```

Verify a new SQL file appears in `drizzle/` that adds the `email` column.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/lib/server/db/schema.ts src/lib/server/services/audit.ts drizzle/
git commit -m "feat(mail): extend schema with email target type, EmailConfig, and email column"
```

---

### Task 2: Extend targets service for email type

**Files:**
- Modify: `src/lib/server/services/targets.ts:55-109`

- [ ] **Step 1: Add EmailConfig import and validation function**

In `src/lib/server/services/targets.ts`, add import at line 4:

```typescript
import type { SshConfig, EmailConfig } from "../db/schema";
```

(Remove the existing `import type { SshConfig } from "../db/schema";` on line 4.)

After the `validateSshConfig` function (after line 67), add:

```typescript
function validateEmailConfig(config: unknown): EmailConfig {
	if (!config || typeof config !== "object") {
		throw new Error("Email config is required for email targets");
	}
	const c = config as Record<string, unknown>;

	function validateServer(key: string): { host: string; port: number; secure: boolean } {
		const server = c[key];
		if (!server || typeof server !== "object") {
			throw new Error(`${key} config is required`);
		}
		const s = server as Record<string, unknown>;
		const host = typeof s.host === "string" ? s.host.trim() : "";
		if (!host) throw new Error(`${key} host is required`);
		const port = typeof s.port === "number" ? s.port : 993;
		if (port < 1 || port > 65535) throw new Error(`${key} port must be between 1 and 65535`);
		const secure = typeof s.secure === "boolean" ? s.secure : true;
		return { host, port, secure };
	}

	return {
		imap: validateServer("imap"),
		smtp: validateServer("smtp"),
	};
}
```

- [ ] **Step 2: Extend createTarget for email type**

Update the `createTarget` function signature (line 69):

```typescript
export async function createTarget(data: {
	name: string;
	type: "api" | "ssh" | "email";
	base_url?: string | null;
	config?: SshConfig | EmailConfig | null;
	email?: string | null;
}) {
```

Update the type validation (line 78):

```typescript
if (data.type !== "api" && data.type !== "ssh" && data.type !== "email") {
	throw new Error("type must be 'api', 'ssh', or 'email'");
}
```

Add email branch after the SSH branch (after line 92):

```typescript
} else if (data.type === "email") {
	config = validateEmailConfig(data.config);
	if (!data.email?.trim()) throw new Error("email address is required for email targets");
}
```

Update the insert values (line 100) to include email:

```typescript
.values({ name, slug, type: data.type, baseUrl, config, email: data.type === "email" ? data.email!.trim() : null })
```

- [ ] **Step 3: Extend updateTarget for email type**

Update the `updateTarget` function signature (line 111):

```typescript
export async function updateTarget(
	id: string,
	data: {
		name?: string;
		type?: "api" | "ssh" | "email";
		base_url?: string | null;
		config?: SshConfig | EmailConfig | null;
		enabled?: boolean;
		email?: string | null;
	},
) {
```

Update the type validation (line 141):

```typescript
if (data.type !== "api" && data.type !== "ssh" && data.type !== "email") {
	throw new Error("type must be 'api', 'ssh', or 'email'");
}
```

In the config update block (line 159-165), add email config validation:

```typescript
if (data.config !== undefined) {
	if (data.config === null) {
		updates.config = null;
	} else if ("imap" in data.config && "smtp" in data.config) {
		updates.config = validateEmailConfig(data.config);
	} else {
		updates.config = validateSshConfig(data.config);
	}
}

if (data.email !== undefined) {
	updates.email = data.email ? data.email.trim() : null;
}
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/server/services/targets.ts
git commit -m "feat(mail): extend targets service with email type, validation, and email field"
```

---

### Task 3: Extend auth methods for imap_smtp type

**Files:**
- Modify: `src/lib/server/services/auth-methods.ts:5-56`

- [ ] **Step 1: Add imap_smtp to VALID_TYPES**

In `src/lib/server/services/auth-methods.ts`, update line 5:

```typescript
const VALID_TYPES = ["bearer", "basic", "custom_header", "query_param", "ssh_key", "jwt_es256", "oauth2_refresh_token", "json_body", "imap_smtp"];
```

- [ ] **Step 2: Add credentialHint branch for imap_smtp**

In `computeCredentialHint`, before the default fallback (before line 55), add:

```typescript
if (type === "imap_smtp") {
	try {
		const config = JSON.parse(credential);
		if (config.username) return `IMAP/SMTP ••• ${config.username}`;
		return "IMAP/SMTP credentials";
	} catch {
		return "IMAP/SMTP (invalid config)";
	}
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/server/services/auth-methods.ts
git commit -m "feat(mail): add imap_smtp auth method type with credential hint"
```

---

### Task 4: Build mail service

**Files:**
- Create: `src/lib/server/services/mail.ts`

- [ ] **Step 1: Create mail service with IMAP connection helper**

Create `src/lib/server/services/mail.ts`:

```typescript
import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import type { EmailConfig } from "../db/schema";

interface MailAuth {
	username: string;
	password: string;
}

function createImapClient(config: EmailConfig, auth: MailAuth): ImapFlow {
	return new ImapFlow({
		host: config.imap.host,
		port: config.imap.port,
		secure: config.imap.secure,
		auth: { user: auth.username, pass: auth.password },
		logger: false,
	});
}

function createSmtpTransport(config: EmailConfig, auth: MailAuth) {
	return nodemailer.createTransport({
		host: config.smtp.host,
		port: config.smtp.port,
		secure: config.smtp.secure,
		auth: { user: auth.username, pass: auth.password },
	});
}

function parseCredential(credential: string): MailAuth {
	const parsed = JSON.parse(credential);
	return { username: parsed.username, password: parsed.password };
}

export async function listFolders(config: EmailConfig, credential: string) {
	const auth = parseCredential(credential);
	const client = createImapClient(config, auth);
	try {
		await client.connect();
		const folders = await client.list();
		return folders.map((f) => ({
			path: f.path,
			name: f.name,
			specialUse: f.specialUse ?? null,
			delimiter: f.delimiter,
		}));
	} finally {
		await client.logout().catch(() => {});
	}
}

export async function search(
	config: EmailConfig,
	credential: string,
	params: { folder?: string; query?: Record<string, string>; limit?: number },
) {
	const auth = parseCredential(credential);
	const client = createImapClient(config, auth);
	const folder = params.folder || "INBOX";
	const limit = params.limit || 20;

	try {
		await client.connect();
		const lock = await client.getMailboxLock(folder);
		try {
			const searchCriteria: Record<string, unknown> = {};
			if (params.query?.from) searchCriteria.from = params.query.from;
			if (params.query?.to) searchCriteria.to = params.query.to;
			if (params.query?.subject) searchCriteria.subject = params.query.subject;
			if (params.query?.since) searchCriteria.since = params.query.since;
			if (params.query?.before) searchCriteria.before = params.query.before;
			if (params.query?.text) searchCriteria.body = params.query.text;

			const hasSearch = Object.keys(searchCriteria).length > 0;
			const uids = hasSearch
				? await client.search(searchCriteria, { uid: true })
				: await client.search({ all: true }, { uid: true });

			const limitedUids = uids.slice(-limit).reverse();
			if (limitedUids.length === 0) return [];

			const results: Array<Record<string, unknown>> = [];
			for await (const msg of client.fetch(limitedUids, {
				uid: true,
				envelope: true,
				flags: true,
				bodyStructure: true,
			})) {
				const hasAttachments = msg.bodyStructure?.childNodes?.some(
					(n: { disposition?: string }) => n.disposition === "attachment",
				) ?? false;

				results.push({
					uid: msg.uid,
					from: msg.envelope.from?.[0]?.address ?? null,
					to: msg.envelope.to?.map((a: { address?: string }) => a.address) ?? [],
					subject: msg.envelope.subject ?? null,
					date: msg.envelope.date?.toISOString() ?? null,
					flags: Array.from(msg.flags),
					hasAttachments,
				});
			}
			return results;
		} finally {
			lock.release();
		}
	} finally {
		await client.logout().catch(() => {});
	}
}

export async function getMessage(
	config: EmailConfig,
	credential: string,
	params: { uid: number; folder?: string },
) {
	const auth = parseCredential(credential);
	const client = createImapClient(config, auth);
	const folder = params.folder || "INBOX";

	try {
		await client.connect();
		const lock = await client.getMailboxLock(folder);
		try {
			const msg = await client.fetchOne(params.uid, {
				uid: true,
				envelope: true,
				flags: true,
				bodyStructure: true,
				source: true,
			});

			if (!msg) return null;

			const { simpleParser } = await import("mailparser");
			const parsed = await simpleParser(msg.source);

			const attachments = (parsed.attachments ?? []).map((a, i) => ({
				partId: String(i + 1),
				filename: a.filename ?? null,
				contentType: a.contentType,
				size: a.size,
			}));

			return {
				uid: msg.uid,
				from: msg.envelope.from?.[0]?.address ?? null,
				to: msg.envelope.to?.map((a: { address?: string }) => a.address) ?? [],
				cc: msg.envelope.cc?.map((a: { address?: string }) => a.address) ?? [],
				subject: msg.envelope.subject ?? null,
				date: msg.envelope.date?.toISOString() ?? null,
				text: parsed.text ?? null,
				html: parsed.html ?? null,
				flags: Array.from(msg.flags),
				attachments,
			};
		} finally {
			lock.release();
		}
	} finally {
		await client.logout().catch(() => {});
	}
}

export async function getAttachment(
	config: EmailConfig,
	credential: string,
	params: { uid: number; partId: string; folder?: string },
) {
	const auth = parseCredential(credential);
	const client = createImapClient(config, auth);
	const folder = params.folder || "INBOX";
	const partIndex = parseInt(params.partId, 10) - 1;

	try {
		await client.connect();
		const lock = await client.getMailboxLock(folder);
		try {
			const msg = await client.fetchOne(params.uid, { uid: true, source: true });
			if (!msg) return null;

			const { simpleParser } = await import("mailparser");
			const parsed = await simpleParser(msg.source);
			const attachment = parsed.attachments?.[partIndex];
			if (!attachment) return null;

			return {
				content: attachment.content,
				contentType: attachment.contentType,
				filename: attachment.filename ?? null,
			};
		} finally {
			lock.release();
		}
	} finally {
		await client.logout().catch(() => {});
	}
}

export async function send(
	config: EmailConfig,
	credential: string,
	params: {
		to: string[];
		cc?: string[];
		bcc?: string[];
		subject: string;
		text?: string;
		html?: string;
		inReplyTo?: string;
	},
) {
	const auth = parseCredential(credential);
	const transport = createSmtpTransport(config, auth);

	try {
		const result = await transport.sendMail({
			from: auth.username,
			to: params.to,
			cc: params.cc,
			bcc: params.bcc,
			subject: params.subject,
			text: params.text,
			html: params.html,
			inReplyTo: params.inReplyTo,
		});
		return { messageId: result.messageId };
	} finally {
		transport.close();
	}
}

export async function createDraft(
	config: EmailConfig,
	credential: string,
	params: {
		to?: string[];
		subject?: string;
		text?: string;
		html?: string;
	},
) {
	const auth = parseCredential(credential);

	// Build raw MIME message using Nodemailer
	const transport = nodemailer.createTransport({ streamTransport: true });
	const message = await transport.sendMail({
		from: auth.username,
		to: params.to,
		subject: params.subject,
		text: params.text,
		html: params.html,
	});
	const rawMessage = message.message as unknown as Buffer;

	// Append to Drafts folder via IMAP
	const client = createImapClient(config, auth);
	try {
		await client.connect();

		// Find Drafts folder
		const folders = await client.list();
		const draftsFolder = folders.find((f) => f.specialUse === "\\Drafts");
		const draftsPath = draftsFolder?.path ?? "Drafts";

		const result = await client.append(draftsPath, rawMessage, ["\\Draft"]);
		return { uid: result.uid ?? null };
	} finally {
		await client.logout().catch(() => {});
	}
}

export async function moveMessage(
	config: EmailConfig,
	credential: string,
	params: { uid: number; from: string; to: string },
) {
	const auth = parseCredential(credential);
	const client = createImapClient(config, auth);

	try {
		await client.connect();
		const lock = await client.getMailboxLock(params.from);
		try {
			await client.messageMove(params.uid, params.to, { uid: true });
		} finally {
			lock.release();
		}
	} finally {
		await client.logout().catch(() => {});
	}
}

export async function flagMessage(
	config: EmailConfig,
	credential: string,
	params: { uid: number; folder: string; add?: string[]; remove?: string[] },
) {
	const auth = parseCredential(credential);
	const client = createImapClient(config, auth);

	try {
		await client.connect();
		const lock = await client.getMailboxLock(params.folder);
		try {
			if (params.add?.length) {
				await client.messageFlagsAdd(params.uid, params.add, { uid: true });
			}
			if (params.remove?.length) {
				await client.messageFlagsRemove(params.uid, params.remove, { uid: true });
			}
		} finally {
			lock.release();
		}
	} finally {
		await client.logout().catch(() => {});
	}
}

export async function testConnection(
	config: EmailConfig,
	credential: string,
): Promise<{ imap: boolean; smtp: boolean; error?: string }> {
	const auth = parseCredential(credential);
	const results = { imap: false, smtp: false };

	try {
		const client = createImapClient(config, auth);
		await client.connect();
		results.imap = true;
		await client.logout().catch(() => {});
	} catch (err) {
		return { ...results, error: `IMAP: ${err instanceof Error ? err.message : "connection failed"}` };
	}

	try {
		const transport = createSmtpTransport(config, auth);
		await transport.verify();
		results.smtp = true;
		transport.close();
	} catch (err) {
		return { ...results, error: `SMTP: ${err instanceof Error ? err.message : "connection failed"}` };
	}

	return results;
}
```

- [ ] **Step 2: Install mailparser for email parsing**

```bash
npm install mailparser
npm install -D @types/mailparser
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/server/services/mail.ts package.json package-lock.json
git commit -m "feat(mail): add mail service with ImapFlow + Nodemailer (search, read, send, draft, folders, move, flag, attachment)"
```

---

### Task 5: Add mail route handlers

**Files:**
- Create: `src/routes/mail/[target]/search/+server.ts`
- Create: `src/routes/mail/[target]/message/[id]/+server.ts`
- Create: `src/routes/mail/[target]/message/[id]/attachment/[partId]/+server.ts`
- Create: `src/routes/mail/[target]/send/+server.ts`
- Create: `src/routes/mail/[target]/draft/+server.ts`
- Create: `src/routes/mail/[target]/folders/+server.ts`
- Create: `src/routes/mail/[target]/move/+server.ts`
- Create: `src/routes/mail/[target]/flag/+server.ts`
- Modify: `src/hooks.server.ts:27-42`

- [ ] **Step 1: Add /mail/ to auth bypass in hooks.server.ts**

In `src/hooks.server.ts`, add after line 30 (`pathname.startsWith("/ssh/") ||`):

```typescript
pathname.startsWith("/mail/") ||
```

- [ ] **Step 2: Create shared mail route helper**

Create `src/routes/mail/resolve.ts`:

```typescript
import { error } from "@sveltejs/kit";
import { requireBearer } from "$lib/server/api-auth";
import { getTargetBySlug } from "$lib/server/services/targets";
import { hasPermission } from "$lib/server/services/permissions";
import { getDefaultAuthMethod } from "$lib/server/services/auth-methods";
import type { EmailConfig, Token } from "$lib/server/db/schema";

export async function resolveMailTarget(request: Request, targetSlug: string) {
	const token = await requireBearer(request);

	const target = await getTargetBySlug(targetSlug);
	if (!target || !target.enabled) throw error(404, "Target not found");
	if (target.type !== "email") throw error(400, "Target is not an email target");

	const permitted = await hasPermission(token.id, target.id);
	if (!permitted) throw error(403, "Forbidden");

	const config = target.config as EmailConfig | null;
	if (!config?.imap?.host || !config?.smtp?.host) throw error(400, "Target has no email configuration");

	const authMethod = await getDefaultAuthMethod(target.id);
	if (!authMethod || authMethod.type !== "imap_smtp") throw error(400, "Target has no IMAP/SMTP credentials configured");

	return { token, target, config, credential: authMethod.credential };
}
```

- [ ] **Step 3: Create search route**

Create `src/routes/mail/[target]/search/+server.ts`:

```typescript
import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { resolveMailTarget } from "../../resolve";
import { search } from "$lib/server/services/mail";
import { logRequest } from "$lib/server/services/audit";
import { getClientAddress } from "$lib/server/api-auth";

export const POST: RequestHandler = async ({ params, request }) => {
	const { token, target, config, credential } = await resolveMailTarget(request, params.target);
	const clientIp = getClientAddress(request);
	const start = Date.now();

	try {
		const body = await request.json();
		const results = await search(config, credential, {
			folder: body.folder,
			query: body.query,
			limit: body.limit,
		});

		logRequest({
			tokenId: token.id, tokenName: token.name,
			targetId: target.id, targetSlug: target.slug,
			type: "mail", method: "search", path: body.folder ?? "INBOX",
			statusCode: 200, clientIp, durationMs: Date.now() - start,
		});

		return json(results);
	} catch (err) {
		logRequest({
			tokenId: token.id, tokenName: token.name,
			targetId: target.id, targetSlug: target.slug,
			type: "mail", method: "search", path: null,
			statusCode: 502, clientIp, durationMs: Date.now() - start,
		});
		throw error(502, err instanceof Error ? err.message : "IMAP operation failed");
	}
};
```

- [ ] **Step 4: Create message read route**

Create `src/routes/mail/[target]/message/[id]/+server.ts`:

```typescript
import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { resolveMailTarget } from "../../../resolve";
import { getMessage } from "$lib/server/services/mail";
import { logRequest } from "$lib/server/services/audit";
import { getClientAddress } from "$lib/server/api-auth";

export const GET: RequestHandler = async ({ params, request, url }) => {
	const { token, target, config, credential } = await resolveMailTarget(request, params.target);
	const clientIp = getClientAddress(request);
	const uid = parseInt(params.id, 10);
	const folder = url.searchParams.get("folder") ?? "INBOX";
	const start = Date.now();

	try {
		const message = await getMessage(config, credential, { uid, folder });
		if (!message) throw error(404, "Message not found");

		logRequest({
			tokenId: token.id, tokenName: token.name,
			targetId: target.id, targetSlug: target.slug,
			type: "mail", method: "read", path: `${folder}/${uid}`,
			statusCode: 200, clientIp, durationMs: Date.now() - start,
		});

		return json(message);
	} catch (err) {
		if ((err as { status?: number }).status === 404) throw err;
		logRequest({
			tokenId: token.id, tokenName: token.name,
			targetId: target.id, targetSlug: target.slug,
			type: "mail", method: "read", path: `${folder}/${uid}`,
			statusCode: 502, clientIp, durationMs: Date.now() - start,
		});
		throw error(502, err instanceof Error ? err.message : "IMAP operation failed");
	}
};
```

- [ ] **Step 5: Create attachment route**

Create `src/routes/mail/[target]/message/[id]/attachment/[partId]/+server.ts`:

```typescript
import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { resolveMailTarget } from "../../../../../resolve";
import { getAttachment } from "$lib/server/services/mail";
import { logRequest } from "$lib/server/services/audit";
import { getClientAddress } from "$lib/server/api-auth";

export const GET: RequestHandler = async ({ params, request, url }) => {
	const { token, target, config, credential } = await resolveMailTarget(request, params.target);
	const clientIp = getClientAddress(request);
	const uid = parseInt(params.id, 10);
	const folder = url.searchParams.get("folder") ?? "INBOX";
	const start = Date.now();

	try {
		const attachment = await getAttachment(config, credential, { uid, partId: params.partId, folder });
		if (!attachment) throw error(404, "Attachment not found");

		logRequest({
			tokenId: token.id, tokenName: token.name,
			targetId: target.id, targetSlug: target.slug,
			type: "mail", method: "attachment", path: `${folder}/${uid}/${params.partId}`,
			statusCode: 200, clientIp, durationMs: Date.now() - start,
		});

		return new Response(attachment.content, {
			headers: {
				"Content-Type": attachment.contentType,
				"Content-Disposition": `attachment; filename="${attachment.filename ?? "attachment"}"`,
			},
		});
	} catch (err) {
		if ((err as { status?: number }).status === 404) throw err;
		logRequest({
			tokenId: token.id, tokenName: token.name,
			targetId: target.id, targetSlug: target.slug,
			type: "mail", method: "attachment", path: `${folder}/${uid}/${params.partId}`,
			statusCode: 502, clientIp, durationMs: Date.now() - start,
		});
		throw error(502, err instanceof Error ? err.message : "IMAP operation failed");
	}
};
```

- [ ] **Step 6: Create send route with hardcoded approval**

Create `src/routes/mail/[target]/send/+server.ts`:

```typescript
import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { resolveMailTarget } from "../../resolve";
import { send } from "$lib/server/services/mail";
import { logRequest } from "$lib/server/services/audit";
import { getClientAddress } from "$lib/server/api-auth";

export const POST: RequestHandler = async ({ params, request }) => {
	const { token, target, config, credential } = await resolveMailTarget(request, params.target);
	const clientIp = getClientAddress(request);
	const body = await request.json();
	const start = Date.now();

	const approved = request.headers.get("X-Shellgate-Approved") === "true";
	if (!approved) {
		const recipients = [
			...(body.to ?? []),
			...(body.cc ?? []),
			...(body.bcc ?? []),
		].join(", ");

		logRequest({
			tokenId: token.id, tokenName: token.name,
			targetId: target.id, targetSlug: target.slug,
			type: "mail", method: "send", path: recipients,
			statusCode: 202, clientIp, durationMs: null,
			guardAction: "approval_required",
			guardReason: `Send email to ${recipients}`,
		});

		return json({
			status: "approval_required",
			reason: `About to send email to ${recipients}`,
			request: { target: params.target, ...body },
			next_action: "STOP. Present the email details to the user (recipients, subject, body preview). Wait for explicit approval. Only then re-call with X-Shellgate-Approved: true header.",
		}, { status: 202 });
	}

	try {
		const result = await send(config, credential, {
			to: body.to,
			cc: body.cc,
			bcc: body.bcc,
			subject: body.subject,
			text: body.text,
			html: body.html,
			inReplyTo: body.inReplyTo,
		});

		logRequest({
			tokenId: token.id, tokenName: token.name,
			targetId: target.id, targetSlug: target.slug,
			type: "mail", method: "send", path: body.to?.join(", ") ?? "",
			statusCode: 200, clientIp, durationMs: Date.now() - start,
			guardAction: "approved",
		});

		return json(result);
	} catch (err) {
		logRequest({
			tokenId: token.id, tokenName: token.name,
			targetId: target.id, targetSlug: target.slug,
			type: "mail", method: "send", path: body.to?.join(", ") ?? "",
			statusCode: 502, clientIp, durationMs: Date.now() - start,
			guardAction: "approved",
		});
		throw error(502, err instanceof Error ? err.message : "SMTP send failed");
	}
};
```

- [ ] **Step 7: Create draft route**

Create `src/routes/mail/[target]/draft/+server.ts`:

```typescript
import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { resolveMailTarget } from "../../resolve";
import { createDraft } from "$lib/server/services/mail";
import { logRequest } from "$lib/server/services/audit";
import { getClientAddress } from "$lib/server/api-auth";

export const POST: RequestHandler = async ({ params, request }) => {
	const { token, target, config, credential } = await resolveMailTarget(request, params.target);
	const clientIp = getClientAddress(request);
	const body = await request.json();
	const start = Date.now();

	try {
		const result = await createDraft(config, credential, {
			to: body.to,
			subject: body.subject,
			text: body.text,
			html: body.html,
		});

		logRequest({
			tokenId: token.id, tokenName: token.name,
			targetId: target.id, targetSlug: target.slug,
			type: "mail", method: "draft", path: body.subject ?? "",
			statusCode: 200, clientIp, durationMs: Date.now() - start,
		});

		return json(result);
	} catch (err) {
		logRequest({
			tokenId: token.id, tokenName: token.name,
			targetId: target.id, targetSlug: target.slug,
			type: "mail", method: "draft", path: null,
			statusCode: 502, clientIp, durationMs: Date.now() - start,
		});
		throw error(502, err instanceof Error ? err.message : "Draft creation failed");
	}
};
```

- [ ] **Step 8: Create folders route**

Create `src/routes/mail/[target]/folders/+server.ts`:

```typescript
import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { resolveMailTarget } from "../../resolve";
import { listFolders } from "$lib/server/services/mail";
import { logRequest } from "$lib/server/services/audit";
import { getClientAddress } from "$lib/server/api-auth";

export const GET: RequestHandler = async ({ params, request }) => {
	const { token, target, config, credential } = await resolveMailTarget(request, params.target);
	const clientIp = getClientAddress(request);
	const start = Date.now();

	try {
		const folders = await listFolders(config, credential);

		logRequest({
			tokenId: token.id, tokenName: token.name,
			targetId: target.id, targetSlug: target.slug,
			type: "mail", method: "folders", path: null,
			statusCode: 200, clientIp, durationMs: Date.now() - start,
		});

		return json(folders);
	} catch (err) {
		logRequest({
			tokenId: token.id, tokenName: token.name,
			targetId: target.id, targetSlug: target.slug,
			type: "mail", method: "folders", path: null,
			statusCode: 502, clientIp, durationMs: Date.now() - start,
		});
		throw error(502, err instanceof Error ? err.message : "IMAP operation failed");
	}
};
```

- [ ] **Step 9: Create move route**

Create `src/routes/mail/[target]/move/+server.ts`:

```typescript
import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { resolveMailTarget } from "../../resolve";
import { moveMessage } from "$lib/server/services/mail";
import { logRequest } from "$lib/server/services/audit";
import { getClientAddress } from "$lib/server/api-auth";

export const POST: RequestHandler = async ({ params, request }) => {
	const { token, target, config, credential } = await resolveMailTarget(request, params.target);
	const clientIp = getClientAddress(request);
	const body = await request.json();
	const uid = parseInt(body.id, 10);
	const start = Date.now();

	try {
		await moveMessage(config, credential, { uid, from: body.from, to: body.to });

		logRequest({
			tokenId: token.id, tokenName: token.name,
			targetId: target.id, targetSlug: target.slug,
			type: "mail", method: "move", path: `${body.from} → ${body.to}`,
			statusCode: 200, clientIp, durationMs: Date.now() - start,
		});

		return json({ ok: true });
	} catch (err) {
		logRequest({
			tokenId: token.id, tokenName: token.name,
			targetId: target.id, targetSlug: target.slug,
			type: "mail", method: "move", path: null,
			statusCode: 502, clientIp, durationMs: Date.now() - start,
		});
		throw error(502, err instanceof Error ? err.message : "IMAP operation failed");
	}
};
```

- [ ] **Step 10: Create flag route**

Create `src/routes/mail/[target]/flag/+server.ts`:

```typescript
import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { resolveMailTarget } from "../../resolve";
import { flagMessage } from "$lib/server/services/mail";
import { logRequest } from "$lib/server/services/audit";
import { getClientAddress } from "$lib/server/api-auth";

export const POST: RequestHandler = async ({ params, request }) => {
	const { token, target, config, credential } = await resolveMailTarget(request, params.target);
	const clientIp = getClientAddress(request);
	const body = await request.json();
	const uid = parseInt(body.id, 10);
	const start = Date.now();

	try {
		await flagMessage(config, credential, {
			uid,
			folder: body.folder ?? "INBOX",
			add: body.add,
			remove: body.remove,
		});

		logRequest({
			tokenId: token.id, tokenName: token.name,
			targetId: target.id, targetSlug: target.slug,
			type: "mail", method: "flag", path: `${body.folder ?? "INBOX"}/${uid}`,
			statusCode: 200, clientIp, durationMs: Date.now() - start,
		});

		return json({ ok: true });
	} catch (err) {
		logRequest({
			tokenId: token.id, tokenName: token.name,
			targetId: target.id, targetSlug: target.slug,
			type: "mail", method: "flag", path: null,
			statusCode: 502, clientIp, durationMs: Date.now() - start,
		});
		throw error(502, err instanceof Error ? err.message : "IMAP operation failed");
	}
};
```

- [ ] **Step 11: Commit**

```bash
git add src/hooks.server.ts src/routes/mail/
git commit -m "feat(mail): add all mail route handlers (search, read, attachment, send, draft, folders, move, flag)"
```

---

### Task 6: Add MCP mail tools

**Files:**
- Create: `src/lib/server/mcp/tools/mail.ts`
- Modify: `src/lib/server/mcp/server.ts`

- [ ] **Step 1: Create MCP mail tool handlers**

Create `src/lib/server/mcp/tools/mail.ts`:

```typescript
import type { Token } from "$lib/server/db/schema";
import type { EmailConfig } from "$lib/server/db/schema";
import { getTargetBySlug } from "$lib/server/services/targets";
import { hasPermission } from "$lib/server/services/permissions";
import { getDefaultAuthMethod } from "$lib/server/services/auth-methods";
import { logRequest } from "$lib/server/services/audit";
import * as mailService from "$lib/server/services/mail";

async function resolveEmailTarget(token: Token, targetSlug: string) {
	const target = await getTargetBySlug(targetSlug);
	if (!target || !target.enabled) return { error: "target not found" };
	if (target.type !== "email") return { error: "target is not an email target" };

	const permitted = await hasPermission(token.id, target.id);
	if (!permitted) return { error: "forbidden" };

	const config = target.config as EmailConfig | null;
	if (!config?.imap?.host || !config?.smtp?.host) return { error: "target has no email configuration" };

	const authMethod = await getDefaultAuthMethod(target.id);
	if (!authMethod || authMethod.type !== "imap_smtp") return { error: "target has no IMAP/SMTP credentials" };

	return { target, config, credential: authMethod.credential };
}

export async function mailSearch(token: Token, args: { target: string; folder?: string; query?: Record<string, string>; limit?: number }) {
	const resolved = await resolveEmailTarget(token, args.target);
	if ("error" in resolved) return resolved;
	const { target, config, credential } = resolved;
	const start = Date.now();

	try {
		const results = await mailService.search(config, credential, { folder: args.folder, query: args.query, limit: args.limit });
		logRequest({ tokenId: token.id, tokenName: token.name, targetId: target.id, targetSlug: target.slug, type: "mail", method: "search", path: args.folder ?? "INBOX", statusCode: 200, clientIp: "mcp", durationMs: Date.now() - start });
		return results;
	} catch (err) {
		logRequest({ tokenId: token.id, tokenName: token.name, targetId: target.id, targetSlug: target.slug, type: "mail", method: "search", path: null, statusCode: 502, clientIp: "mcp", durationMs: Date.now() - start });
		return { error: err instanceof Error ? err.message : "IMAP operation failed" };
	}
}

export async function mailRead(token: Token, args: { target: string; uid: number; folder?: string }) {
	const resolved = await resolveEmailTarget(token, args.target);
	if ("error" in resolved) return resolved;
	const { target, config, credential } = resolved;
	const start = Date.now();

	try {
		const message = await mailService.getMessage(config, credential, { uid: args.uid, folder: args.folder });
		if (!message) return { error: "message not found" };
		logRequest({ tokenId: token.id, tokenName: token.name, targetId: target.id, targetSlug: target.slug, type: "mail", method: "read", path: `${args.folder ?? "INBOX"}/${args.uid}`, statusCode: 200, clientIp: "mcp", durationMs: Date.now() - start });
		return message;
	} catch (err) {
		logRequest({ tokenId: token.id, tokenName: token.name, targetId: target.id, targetSlug: target.slug, type: "mail", method: "read", path: null, statusCode: 502, clientIp: "mcp", durationMs: Date.now() - start });
		return { error: err instanceof Error ? err.message : "IMAP operation failed" };
	}
}

export async function mailAttachment(token: Token, args: { target: string; uid: number; partId: string; folder?: string }) {
	const resolved = await resolveEmailTarget(token, args.target);
	if ("error" in resolved) return resolved;
	const { target, config, credential } = resolved;
	const start = Date.now();

	try {
		const attachment = await mailService.getAttachment(config, credential, { uid: args.uid, partId: args.partId, folder: args.folder });
		if (!attachment) return { error: "attachment not found" };
		logRequest({ tokenId: token.id, tokenName: token.name, targetId: target.id, targetSlug: target.slug, type: "mail", method: "attachment", path: `${args.folder ?? "INBOX"}/${args.uid}/${args.partId}`, statusCode: 200, clientIp: "mcp", durationMs: Date.now() - start });
		return { filename: attachment.filename, contentType: attachment.contentType, content: attachment.content.toString("base64") };
	} catch (err) {
		logRequest({ tokenId: token.id, tokenName: token.name, targetId: target.id, targetSlug: target.slug, type: "mail", method: "attachment", path: null, statusCode: 502, clientIp: "mcp", durationMs: Date.now() - start });
		return { error: err instanceof Error ? err.message : "IMAP operation failed" };
	}
}

export async function mailSend(token: Token, args: { target: string; to: string[]; cc?: string[]; bcc?: string[]; subject: string; text?: string; html?: string; inReplyTo?: string; approved?: boolean }) {
	const resolved = await resolveEmailTarget(token, args.target);
	if ("error" in resolved) return resolved;
	const { target, config, credential } = resolved;

	if (!args.approved) {
		const recipients = [...(args.to ?? []), ...(args.cc ?? []), ...(args.bcc ?? [])].join(", ");
		logRequest({ tokenId: token.id, tokenName: token.name, targetId: target.id, targetSlug: target.slug, type: "mail", method: "send", path: recipients, statusCode: 202, clientIp: "mcp", durationMs: null, guardAction: "approval_required", guardReason: `Send email to ${recipients}` });
		return {
			status: "approval_required",
			reason: `About to send email to ${recipients} with subject "${args.subject}"`,
			request: { target: args.target, to: args.to, cc: args.cc, bcc: args.bcc, subject: args.subject },
			next_action: "STOP. Present the email details to the user (recipients, subject, body preview). Wait for explicit approval. Only then re-call this SAME tool with all the SAME parameters AND set approved: true. If the user denies, abort. Never auto-approve.",
		};
	}

	const start = Date.now();
	try {
		const result = await mailService.send(config, credential, { to: args.to, cc: args.cc, bcc: args.bcc, subject: args.subject, text: args.text, html: args.html, inReplyTo: args.inReplyTo });
		logRequest({ tokenId: token.id, tokenName: token.name, targetId: target.id, targetSlug: target.slug, type: "mail", method: "send", path: args.to.join(", "), statusCode: 200, clientIp: "mcp", durationMs: Date.now() - start, guardAction: "approved" });
		return result;
	} catch (err) {
		logRequest({ tokenId: token.id, tokenName: token.name, targetId: target.id, targetSlug: target.slug, type: "mail", method: "send", path: null, statusCode: 502, clientIp: "mcp", durationMs: Date.now() - start, guardAction: "approved" });
		return { error: err instanceof Error ? err.message : "SMTP send failed" };
	}
}

export async function mailDraft(token: Token, args: { target: string; to?: string[]; subject?: string; text?: string; html?: string }) {
	const resolved = await resolveEmailTarget(token, args.target);
	if ("error" in resolved) return resolved;
	const { target, config, credential } = resolved;
	const start = Date.now();

	try {
		const result = await mailService.createDraft(config, credential, { to: args.to, subject: args.subject, text: args.text, html: args.html });
		logRequest({ tokenId: token.id, tokenName: token.name, targetId: target.id, targetSlug: target.slug, type: "mail", method: "draft", path: args.subject ?? "", statusCode: 200, clientIp: "mcp", durationMs: Date.now() - start });
		return result;
	} catch (err) {
		logRequest({ tokenId: token.id, tokenName: token.name, targetId: target.id, targetSlug: target.slug, type: "mail", method: "draft", path: null, statusCode: 502, clientIp: "mcp", durationMs: Date.now() - start });
		return { error: err instanceof Error ? err.message : "Draft creation failed" };
	}
}

export async function mailFolders(token: Token, args: { target: string }) {
	const resolved = await resolveEmailTarget(token, args.target);
	if ("error" in resolved) return resolved;
	const { target, config, credential } = resolved;
	const start = Date.now();

	try {
		const folders = await mailService.listFolders(config, credential);
		logRequest({ tokenId: token.id, tokenName: token.name, targetId: target.id, targetSlug: target.slug, type: "mail", method: "folders", path: null, statusCode: 200, clientIp: "mcp", durationMs: Date.now() - start });
		return folders;
	} catch (err) {
		logRequest({ tokenId: token.id, tokenName: token.name, targetId: target.id, targetSlug: target.slug, type: "mail", method: "folders", path: null, statusCode: 502, clientIp: "mcp", durationMs: Date.now() - start });
		return { error: err instanceof Error ? err.message : "IMAP operation failed" };
	}
}

export async function mailMove(token: Token, args: { target: string; uid: number; from: string; to: string }) {
	const resolved = await resolveEmailTarget(token, args.target);
	if ("error" in resolved) return resolved;
	const { target, config, credential } = resolved;
	const start = Date.now();

	try {
		await mailService.moveMessage(config, credential, { uid: args.uid, from: args.from, to: args.to });
		logRequest({ tokenId: token.id, tokenName: token.name, targetId: target.id, targetSlug: target.slug, type: "mail", method: "move", path: `${args.from} → ${args.to}`, statusCode: 200, clientIp: "mcp", durationMs: Date.now() - start });
		return { ok: true };
	} catch (err) {
		logRequest({ tokenId: token.id, tokenName: token.name, targetId: target.id, targetSlug: target.slug, type: "mail", method: "move", path: null, statusCode: 502, clientIp: "mcp", durationMs: Date.now() - start });
		return { error: err instanceof Error ? err.message : "IMAP operation failed" };
	}
}

export async function mailFlag(token: Token, args: { target: string; uid: number; folder?: string; add?: string[]; remove?: string[] }) {
	const resolved = await resolveEmailTarget(token, args.target);
	if ("error" in resolved) return resolved;
	const { target, config, credential } = resolved;
	const start = Date.now();

	try {
		await mailService.flagMessage(config, credential, { uid: args.uid, folder: args.folder ?? "INBOX", add: args.add, remove: args.remove });
		logRequest({ tokenId: token.id, tokenName: token.name, targetId: target.id, targetSlug: target.slug, type: "mail", method: "flag", path: `${args.folder ?? "INBOX"}/${args.uid}`, statusCode: 200, clientIp: "mcp", durationMs: Date.now() - start });
		return { ok: true };
	} catch (err) {
		logRequest({ tokenId: token.id, tokenName: token.name, targetId: target.id, targetSlug: target.slug, type: "mail", method: "flag", path: null, statusCode: 502, clientIp: "mcp", durationMs: Date.now() - start });
		return { error: err instanceof Error ? err.message : "IMAP operation failed" };
	}
}
```

- [ ] **Step 2: Register mail tools in MCP server**

In `src/lib/server/mcp/server.ts`, add import after line 16:

```typescript
import { mailSearch, mailRead, mailAttachment, mailSend, mailDraft, mailFolders, mailMove, mailFlag } from "./tools/mail";
import type { MailSearchArgs, MailReadArgs, MailAttachmentArgs, MailSendArgs, MailDraftArgs, MailFoldersArgs, MailMoveArgs, MailFlagArgs } from "./tools/mail";
```

Note: The types don't exist yet — we won't add separate interface exports since the args are simple enough to inline. Instead, just import the functions:

```typescript
import { mailSearch, mailRead, mailAttachment, mailSend, mailDraft, mailFolders, mailMove, mailFlag } from "./tools/mail";
```

After the `vault_search` tool registration (after line 344), add:

```typescript
	server.tool(
		"mail_search",
		"Search emails in a mailbox. Returns message list with uid, from, to, subject, date, flags.",
		{
			target: z.string().describe("Email target slug"),
			folder: z.string().optional().describe("Folder to search (default: INBOX)"),
			query: z.record(z.string(), z.string()).optional().describe("Search criteria: from, to, subject, since, before, text"),
			limit: z.number().optional().describe("Max results (default: 20)"),
		},
		async (args) => {
			const result = await mailSearch(token, args);
			return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
		}
	);

	server.tool(
		"mail_read",
		"Read a full email message by UID. Returns from, to, cc, subject, date, text, html, flags, and attachment metadata.",
		{
			target: z.string().describe("Email target slug"),
			uid: z.number().describe("Message UID"),
			folder: z.string().optional().describe("Folder (default: INBOX)"),
		},
		async (args) => {
			const result = await mailRead(token, args);
			return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
		}
	);

	server.tool(
		"mail_attachment",
		"Download an email attachment by UID and part ID. Returns base64-encoded content.",
		{
			target: z.string().describe("Email target slug"),
			uid: z.number().describe("Message UID"),
			partId: z.string().describe("Attachment part ID from mail_read response"),
			folder: z.string().optional().describe("Folder (default: INBOX)"),
		},
		async (args) => {
			const result = await mailAttachment(token, args);
			return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
		}
	);

	server.tool(
		"mail_send",
		"Send an email. Requires approval — first call returns approval_required, re-call with approved: true after user confirms.",
		{
			target: z.string().describe("Email target slug"),
			to: z.array(z.string()).describe("Recipient email addresses"),
			cc: z.array(z.string()).optional().describe("CC addresses"),
			bcc: z.array(z.string()).optional().describe("BCC addresses"),
			subject: z.string().describe("Email subject"),
			text: z.string().optional().describe("Plain text body"),
			html: z.string().optional().describe("HTML body"),
			inReplyTo: z.string().optional().describe("Message-ID to reply to"),
			approved: z.preprocess(val => val === "true" || val === true, z.boolean()).optional().describe("Set to true after user approves"),
		},
		async (args) => {
			const result = await mailSend(token, args);
			return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
		}
	);

	server.tool(
		"mail_draft",
		"Create a draft email in the Drafts folder.",
		{
			target: z.string().describe("Email target slug"),
			to: z.array(z.string()).optional().describe("Recipient email addresses"),
			subject: z.string().optional().describe("Email subject"),
			text: z.string().optional().describe("Plain text body"),
			html: z.string().optional().describe("HTML body"),
		},
		async (args) => {
			const result = await mailDraft(token, args);
			return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
		}
	);

	server.tool(
		"mail_folders",
		"List all folders/labels in the mailbox.",
		{
			target: z.string().describe("Email target slug"),
		},
		async (args) => {
			const result = await mailFolders(token, args);
			return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
		}
	);

	server.tool(
		"mail_move",
		"Move an email to a different folder.",
		{
			target: z.string().describe("Email target slug"),
			uid: z.number().describe("Message UID"),
			from: z.string().describe("Source folder"),
			to: z.string().describe("Destination folder"),
		},
		async (args) => {
			const result = await mailMove(token, args);
			return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
		}
	);

	server.tool(
		"mail_flag",
		"Set or unset flags on an email (e.g. \\Seen, \\Flagged).",
		{
			target: z.string().describe("Email target slug"),
			uid: z.number().describe("Message UID"),
			folder: z.string().optional().describe("Folder (default: INBOX)"),
			add: z.array(z.string()).optional().describe("Flags to add"),
			remove: z.array(z.string()).optional().describe("Flags to remove"),
		},
		async (args) => {
			const result = await mailFlag(token, args);
			return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
		}
	);
```

- [ ] **Step 3: Add mail tools to createMcpToolHandler switch**

In the `createMcpToolHandler` function, before the `default:` case (before line 396), add:

```typescript
			case "mail_search":
				return mailSearch(t, args as unknown as { target: string; folder?: string; query?: Record<string, string>; limit?: number });
			case "mail_read":
				return mailRead(t, args as unknown as { target: string; uid: number; folder?: string });
			case "mail_attachment":
				return mailAttachment(t, args as unknown as { target: string; uid: number; partId: string; folder?: string });
			case "mail_send":
				return mailSend(t, args as unknown as { target: string; to: string[]; cc?: string[]; bcc?: string[]; subject: string; text?: string; html?: string; inReplyTo?: string; approved?: boolean });
			case "mail_draft":
				return mailDraft(t, args as unknown as { target: string; to?: string[]; subject?: string; text?: string; html?: string });
			case "mail_folders":
				return mailFolders(t, args as unknown as { target: string });
			case "mail_move":
				return mailMove(t, args as unknown as { target: string; uid: number; from: string; to: string });
			case "mail_flag":
				return mailFlag(t, args as unknown as { target: string; uid: number; folder?: string; add?: string[]; remove?: string[] });
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/server/mcp/tools/mail.ts src/lib/server/mcp/server.ts
git commit -m "feat(mail): register 8 MCP mail tools (search, read, attachment, send, draft, folders, move, flag)"
```

---

### Task 7: Update bootstrap to include email field

**Files:**
- Modify: `src/lib/server/mcp/tools/bootstrap.ts:13-29`

- [ ] **Step 1: Add email field to bootstrap target output**

In `src/lib/server/mcp/tools/bootstrap.ts`, update the target mapping (lines 18-26):

```typescript
				return {
					slug: target.slug,
					name: target.name,
					type: target.type,
					...(target.type === "api" && {
						proxy: `/gateway/${target.slug}`,
						baseUrl: target.baseUrl,
					}),
					...(target.type === "email" && {
						email: target.email,
					}),
				};
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/server/mcp/tools/bootstrap.ts
git commit -m "feat(mail): include email address in bootstrap response for email targets"
```

---

### Task 8: Dashboard — tabbed target list

**Files:**
- Modify: `src/routes/(app)/targets/+page.svelte`

- [ ] **Step 1: Read the current targets page**

Read `src/routes/(app)/targets/+page.svelte` to understand the current layout before making changes.

- [ ] **Step 2: Add tabbed view with counts**

Replace the target list section with shadcn-svelte Tabs. The exact implementation depends on the current markup, but the pattern is:

```svelte
<script>
  import * as Tabs from "$lib/components/ui/tabs";
  import { Badge } from "$lib/components/ui/badge";

  // ... existing data
  $: apiTargets = data.targets.filter(t => t.type === "api");
  $: sshTargets = data.targets.filter(t => t.type === "ssh");
  $: emailTargets = data.targets.filter(t => t.type === "email");
</script>

<Tabs.Root value="api">
  <Tabs.List>
    <Tabs.Trigger value="api">API <Badge variant="secondary">{apiTargets.length}</Badge></Tabs.Trigger>
    <Tabs.Trigger value="ssh">SSH <Badge variant="secondary">{sshTargets.length}</Badge></Tabs.Trigger>
    <Tabs.Trigger value="email">Email <Badge variant="secondary">{emailTargets.length}</Badge></Tabs.Trigger>
  </Tabs.List>
  <Tabs.Content value="api">
    <!-- existing target cards filtered to apiTargets -->
  </Tabs.Content>
  <Tabs.Content value="ssh">
    <!-- existing target cards filtered to sshTargets -->
  </Tabs.Content>
  <Tabs.Content value="email">
    <!-- existing target cards filtered to emailTargets -->
  </Tabs.Content>
</Tabs.Root>
```

Adapt to match the existing component structure and styling. The target cards themselves don't change — just the filtering.

- [ ] **Step 3: Commit**

```bash
git add src/routes/(app)/targets/+page.svelte
git commit -m "feat(mail): add tabbed target list with type counts (API/SSH/Email)"
```

---

### Task 9: Dashboard — email target create form

**Files:**
- Modify: `src/routes/(app)/targets/+page.server.ts:22-49`
- Modify: `src/routes/(app)/targets/+page.svelte`

- [ ] **Step 1: Extend create action for email type**

In `src/routes/(app)/targets/+page.server.ts`, update the create action. After the SSH branch (after line 39), add an email branch:

```typescript
		} else if (type === "email") {
			const email = data.get("email")?.toString()?.trim() ?? "";
			const imapHost = data.get("imap_host")?.toString()?.trim() ?? "";
			const imapPort = parseInt(data.get("imap_port")?.toString() ?? "993", 10) || 993;
			const imapSecure = data.get("imap_secure")?.toString() !== "false";
			const smtpHost = data.get("smtp_host")?.toString()?.trim() ?? "";
			const smtpPort = parseInt(data.get("smtp_port")?.toString() ?? "587", 10) || 587;
			const smtpSecure = data.get("smtp_secure")?.toString() === "true";
			if (!email) return fail(400, { error: "Email address is required" });
			if (!imapHost) return fail(400, { error: "IMAP host is required" });
			if (!smtpHost) return fail(400, { error: "SMTP host is required" });
			try {
				const target = await createTarget({
					name, type: "email", email,
					config: {
						imap: { host: imapHost, port: imapPort, secure: imapSecure },
						smtp: { host: smtpHost, port: smtpPort, secure: smtpSecure },
					},
				});
				return { created: { ...target, enabled: target.enabled !== false } };
			} catch (err) {
				return fail(400, { error: err instanceof Error ? err.message : "Failed to create target" });
			}
```

Update the type cast on line 25:

```typescript
const type = (data.get("type")?.toString() ?? "api") as "api" | "ssh" | "email";
```

- [ ] **Step 2: Add email form fields to the create dialog**

In `src/routes/(app)/targets/+page.svelte`, add form fields that show when type is `email`:

```svelte
{#if type === "email"}
  <div class="space-y-2">
    <label for="email">Email Address</label>
    <input name="email" id="email" type="email" required placeholder="info@example.com" />
  </div>
  <div class="grid grid-cols-2 gap-4">
    <div class="space-y-2">
      <h4>Incoming (IMAP)</h4>
      <input name="imap_host" placeholder="imap.gmail.com" required />
      <input name="imap_port" type="number" value="993" />
      <select name="imap_secure">
        <option value="true" selected>SSL/TLS</option>
        <option value="false">STARTTLS / None</option>
      </select>
    </div>
    <div class="space-y-2">
      <h4>Outgoing (SMTP)</h4>
      <input name="smtp_host" placeholder="smtp.gmail.com" required />
      <input name="smtp_port" type="number" value="587" />
      <select name="smtp_secure">
        <option value="false" selected>STARTTLS</option>
        <option value="true">SSL/TLS</option>
      </select>
    </div>
  </div>
{/if}
```

Adapt to match existing form patterns (class names, component usage).

- [ ] **Step 3: Add imap_smtp auth method handling to addAuthMethod action**

In the `addAuthMethod` action, add a branch for `imap_smtp` type (after the `oauth2_refresh_token` branch):

```typescript
		} else if (type === "imap_smtp") {
			const username = data.get("credential1")?.toString() ?? "";
			const password = data.get("credential2")?.toString() ?? "";
			if (!username || !password) return fail(400, { error: "Username and password are required" });
			credential = JSON.stringify({ username, password });
```

- [ ] **Step 4: Commit**

```bash
git add src/routes/(app)/targets/+page.server.ts src/routes/(app)/targets/+page.svelte
git commit -m "feat(mail): add email target create form with IMAP/SMTP config fields"
```

---

### Task 10: Dashboard — email target detail page + test connection

**Files:**
- Modify: `src/routes/(app)/targets/[slug]/+page.server.ts`
- Modify: `src/routes/(app)/targets/[slug]/+page.svelte`

- [ ] **Step 1: Add updateEmailConfig action**

In `src/routes/(app)/targets/[slug]/+page.server.ts`, add a new action for updating email configuration:

```typescript
	updateEmailConfig: async ({ request, params }) => {
		const target = await getTargetBySlug(params.slug);
		if (!target) return fail(404, { error: "Target not found" });

		const data = await request.formData();
		const email = data.get("email")?.toString()?.trim() ?? "";
		const imapHost = data.get("imap_host")?.toString()?.trim() ?? "";
		const imapPort = parseInt(data.get("imap_port")?.toString() ?? "993", 10) || 993;
		const imapSecure = data.get("imap_secure")?.toString() !== "false";
		const smtpHost = data.get("smtp_host")?.toString()?.trim() ?? "";
		const smtpPort = parseInt(data.get("smtp_port")?.toString() ?? "587", 10) || 587;
		const smtpSecure = data.get("smtp_secure")?.toString() === "true";

		try {
			const result = await updateTarget(target.id, {
				email,
				config: {
					imap: { host: imapHost, port: imapPort, secure: imapSecure },
					smtp: { host: smtpHost, port: smtpPort, secure: smtpSecure },
				},
			});
			if (!result) return fail(404, { error: "Target not found" });
			return { updated: true };
		} catch (err) {
			return fail(400, { error: err instanceof Error ? err.message : "Failed to update" });
		}
	},
```

- [ ] **Step 2: Add testConnection action**

Add a test connection action:

```typescript
	testConnection: async ({ params }) => {
		const target = await getTargetBySlug(params.slug);
		if (!target) return fail(404, { error: "Target not found" });
		if (target.type !== "email") return fail(400, { error: "Not an email target" });

		const { getDefaultAuthMethod } = await import("$lib/server/services/auth-methods");
		const { testConnection } = await import("$lib/server/services/mail");
		const { EmailConfig } = await import("$lib/server/db/schema");

		const authMethod = await getDefaultAuthMethod(target.id);
		if (!authMethod || authMethod.type !== "imap_smtp") {
			return fail(400, { error: "No IMAP/SMTP credentials configured" });
		}

		const config = target.config as EmailConfig;
		const result = await testConnection(config, authMethod.credential);
		return { testResult: result };
	},
```

Note: Import `EmailConfig` type properly — use `import type { EmailConfig } from "$lib/server/db/schema"` at the top of the file.

- [ ] **Step 3: Add email config display to detail page**

In `src/routes/(app)/targets/[slug]/+page.svelte`, add a section for email targets that shows the IMAP/SMTP config with edit form and test connection button. Follow the existing pattern used for SSH config display and API baseUrl display.

- [ ] **Step 4: Commit**

```bash
git add src/routes/(app)/targets/[slug]/+page.server.ts src/routes/(app)/targets/[slug]/+page.svelte
git commit -m "feat(mail): add email config editing and test connection to target detail page"
```

---

### Task 11: Update AGENTS.md and verify

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 1: Update AGENTS.md**

Add `/mail/[target]/*` routes to the agent-facing routes table. Add `mail_search`, `mail_read`, `mail_attachment`, `mail_send`, `mail_draft`, `mail_folders`, `mail_move`, `mail_flag` to the MCP tools list. Add `mail` service to the key services table. Add `imap_smtp` to the auth method types list.

- [ ] **Step 2: Run dev server and verify**

```bash
npm run dev
```

Verify the app starts without errors. Check:
- Migration runs on startup
- `/targets` page loads with tabs
- Can create an email target
- MCP tools are registered (check via MCP inspector or bootstrap response)

- [ ] **Step 3: Commit**

```bash
git add AGENTS.md
git commit -m "docs: update AGENTS.md with mail integration routes, tools, and service"
```

---

### Task 12: Manual integration test

This task is manual — test with a real email account.

- [ ] **Step 1: Create email target via dashboard**

Go to `/targets`, click "Email" tab, create a target with a test email account (e.g., Gmail with app password).

- [ ] **Step 2: Add imap_smtp auth method**

On the target detail page, add credentials with type `imap_smtp`.

- [ ] **Step 3: Test connection**

Click "Test Connection" — verify both IMAP and SMTP connect successfully.

- [ ] **Step 4: Test via MCP tools**

Use Claude Code with the Shellgate MCP server to test:
- `mail_folders` — list folders
- `mail_search` — search INBOX
- `mail_read` — read a specific email
- `mail_draft` — create a draft
- `mail_send` — send a test email (verify approval flow)

- [ ] **Step 5: Check audit logs**

Verify all mail operations appear in `/logs` with type `mail`.
