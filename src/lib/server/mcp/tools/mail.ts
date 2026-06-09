import type { Token } from "$lib/server/db/schema";
import type { EmailConfig } from "$lib/server/db/schema";
import { getTargetBySlug } from "$lib/server/services/targets";
import { hasPermission } from "$lib/server/services/permissions";
import { getDefaultAuthMethod } from "$lib/server/services/auth-methods";
import { logRequest } from "$lib/server/services/audit";
import * as mail from "$lib/server/services/mail";

// ---------------------------------------------------------------------------
// Target resolution
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Tool handlers
// ---------------------------------------------------------------------------

export async function mailSearch(token: Token, args: {
	target: string;
	folder?: string;
	query?: Record<string, string>;
	limit?: number;
}) {
	const resolved = await resolveEmailTarget(token, args.target);
	if ("error" in resolved) return resolved;
	const { target, config, credential } = resolved;

	try {
		const searchQuery: mail.SearchQuery = {
			folder: args.folder,
			limit: args.limit,
			...(args.query ? {
				from: args.query.from,
				to: args.query.to,
				subject: args.query.subject,
				text: args.query.text,
				since: args.query.since ? new Date(args.query.since) : undefined,
				before: args.query.before ? new Date(args.query.before) : undefined,
			} : {}),
		};

		const results = await mail.search(config, credential, searchQuery);

		logRequest({
			tokenId: token.id,
			tokenName: token.name,
			targetId: target.id,
			targetSlug: target.slug,
			type: "mail",
			method: null,
			path: "search",
			statusCode: 200,
			clientIp: "mcp",
			durationMs: null,
		});

		return { messages: results };
	} catch (err) {
		const message = err instanceof Error ? err.message : "Mail search failed";
		logRequest({
			tokenId: token.id,
			tokenName: token.name,
			targetId: target.id,
			targetSlug: target.slug,
			type: "mail",
			method: null,
			path: "search",
			statusCode: 500,
			clientIp: "mcp",
			durationMs: null,
		});
		return { error: message };
	}
}

export async function mailRead(token: Token, args: {
	target: string;
	uid: number;
	folder?: string;
}) {
	const resolved = await resolveEmailTarget(token, args.target);
	if ("error" in resolved) return resolved;
	const { target, config, credential } = resolved;

	try {
		const message = await mail.getMessage(config, credential, { uid: args.uid, folder: args.folder });

		logRequest({
			tokenId: token.id,
			tokenName: token.name,
			targetId: target.id,
			targetSlug: target.slug,
			type: "mail",
			method: null,
			path: `read/${args.uid}`,
			statusCode: message ? 200 : 404,
			clientIp: "mcp",
			durationMs: null,
		});

		if (!message) return { error: "message not found" };
		return message;
	} catch (err) {
		const message = err instanceof Error ? err.message : "Mail read failed";
		logRequest({
			tokenId: token.id,
			tokenName: token.name,
			targetId: target.id,
			targetSlug: target.slug,
			type: "mail",
			method: null,
			path: `read/${args.uid}`,
			statusCode: 500,
			clientIp: "mcp",
			durationMs: null,
		});
		return { error: message };
	}
}

export async function mailAttachment(token: Token, args: {
	target: string;
	uid: number;
	partId: number;
	folder?: string;
}) {
	const resolved = await resolveEmailTarget(token, args.target);
	if ("error" in resolved) return resolved;
	const { target, config, credential } = resolved;

	try {
		const attachment = await mail.getAttachment(config, credential, {
			uid: args.uid,
			partId: args.partId,
			folder: args.folder,
		});

		logRequest({
			tokenId: token.id,
			tokenName: token.name,
			targetId: target.id,
			targetSlug: target.slug,
			type: "mail",
			method: null,
			path: `attachment/${args.uid}/${args.partId}`,
			statusCode: attachment ? 200 : 404,
			clientIp: "mcp",
			durationMs: null,
		});

		if (!attachment) return { error: "attachment not found" };
		return {
			filename: attachment.filename,
			contentType: attachment.contentType,
			content: attachment.content.toString("base64"),
		};
	} catch (err) {
		const message = err instanceof Error ? err.message : "Mail attachment failed";
		logRequest({
			tokenId: token.id,
			tokenName: token.name,
			targetId: target.id,
			targetSlug: target.slug,
			type: "mail",
			method: null,
			path: `attachment/${args.uid}/${args.partId}`,
			statusCode: 500,
			clientIp: "mcp",
			durationMs: null,
		});
		return { error: message };
	}
}

export async function mailSend(token: Token, args: {
	target: string;
	to: string | string[];
	cc?: string | string[];
	bcc?: string | string[];
	subject: string;
	text?: string;
	html?: string;
	inReplyTo?: string;
	approved?: boolean;
}) {
	const resolved = await resolveEmailTarget(token, args.target);
	if ("error" in resolved) return resolved;
	const { target, config, credential } = resolved;

	if (!args.approved) {
		logRequest({
			tokenId: token.id,
			tokenName: token.name,
			targetId: target.id,
			targetSlug: target.slug,
			type: "mail",
			method: null,
			path: "send",
			statusCode: 202,
			clientIp: "mcp",
			durationMs: null,
		});
		return {
			status: "approval_required",
			request: {
				target: args.target,
				to: args.to,
				cc: args.cc,
				bcc: args.bcc,
				subject: args.subject,
				text: args.text,
				html: args.html,
				inReplyTo: args.inReplyTo,
			},
			next_action:
				"STOP. Present the email details to the user (recipients, subject, body preview). Wait for explicit approval. Only then re-call this SAME tool with all the SAME parameters AND set approved: true. If the user denies, abort. Never auto-approve.",
		};
	}

	try {
		const result = await mail.send(config, credential, {
			to: args.to,
			cc: args.cc,
			bcc: args.bcc,
			subject: args.subject,
			text: args.text,
			html: args.html,
			inReplyTo: args.inReplyTo,
		});

		logRequest({
			tokenId: token.id,
			tokenName: token.name,
			targetId: target.id,
			targetSlug: target.slug,
			type: "mail",
			method: null,
			path: "send",
			statusCode: 200,
			clientIp: "mcp",
			durationMs: null,
		});

		return { messageId: result.messageId };
	} catch (err) {
		const message = err instanceof Error ? err.message : "Mail send failed";
		logRequest({
			tokenId: token.id,
			tokenName: token.name,
			targetId: target.id,
			targetSlug: target.slug,
			type: "mail",
			method: null,
			path: "send",
			statusCode: 500,
			clientIp: "mcp",
			durationMs: null,
		});
		return { error: message };
	}
}

export async function mailDraft(token: Token, args: {
	target: string;
	to?: string | string[];
	subject?: string;
	text?: string;
	html?: string;
}) {
	const resolved = await resolveEmailTarget(token, args.target);
	if ("error" in resolved) return resolved;
	const { target, config, credential } = resolved;

	try {
		const result = await mail.createDraft(config, credential, {
			to: args.to,
			subject: args.subject,
			text: args.text,
			html: args.html,
		});

		logRequest({
			tokenId: token.id,
			tokenName: token.name,
			targetId: target.id,
			targetSlug: target.slug,
			type: "mail",
			method: null,
			path: "draft",
			statusCode: 200,
			clientIp: "mcp",
			durationMs: null,
		});

		return { uid: result.uid };
	} catch (err) {
		const message = err instanceof Error ? err.message : "Mail draft failed";
		logRequest({
			tokenId: token.id,
			tokenName: token.name,
			targetId: target.id,
			targetSlug: target.slug,
			type: "mail",
			method: null,
			path: "draft",
			statusCode: 500,
			clientIp: "mcp",
			durationMs: null,
		});
		return { error: message };
	}
}

export async function mailFolders(token: Token, args: {
	target: string;
}) {
	const resolved = await resolveEmailTarget(token, args.target);
	if ("error" in resolved) return resolved;
	const { target, config, credential } = resolved;

	try {
		const folders = await mail.listFolders(config, credential);

		logRequest({
			tokenId: token.id,
			tokenName: token.name,
			targetId: target.id,
			targetSlug: target.slug,
			type: "mail",
			method: null,
			path: "folders",
			statusCode: 200,
			clientIp: "mcp",
			durationMs: null,
		});

		return { folders };
	} catch (err) {
		const message = err instanceof Error ? err.message : "Mail folders failed";
		logRequest({
			tokenId: token.id,
			tokenName: token.name,
			targetId: target.id,
			targetSlug: target.slug,
			type: "mail",
			method: null,
			path: "folders",
			statusCode: 500,
			clientIp: "mcp",
			durationMs: null,
		});
		return { error: message };
	}
}

export async function mailMove(token: Token, args: {
	target: string;
	uid: number;
	from: string;
	to: string;
}) {
	const resolved = await resolveEmailTarget(token, args.target);
	if ("error" in resolved) return resolved;
	const { target, config, credential } = resolved;

	try {
		await mail.moveMessage(config, credential, { uid: args.uid, from: args.from, to: args.to });

		logRequest({
			tokenId: token.id,
			tokenName: token.name,
			targetId: target.id,
			targetSlug: target.slug,
			type: "mail",
			method: null,
			path: `move/${args.uid}`,
			statusCode: 200,
			clientIp: "mcp",
			durationMs: null,
		});

		return { success: true };
	} catch (err) {
		const message = err instanceof Error ? err.message : "Mail move failed";
		logRequest({
			tokenId: token.id,
			tokenName: token.name,
			targetId: target.id,
			targetSlug: target.slug,
			type: "mail",
			method: null,
			path: `move/${args.uid}`,
			statusCode: 500,
			clientIp: "mcp",
			durationMs: null,
		});
		return { error: message };
	}
}

export async function mailFlag(token: Token, args: {
	target: string;
	uid: number;
	folder?: string;
	add?: string[];
	remove?: string[];
}) {
	const resolved = await resolveEmailTarget(token, args.target);
	if ("error" in resolved) return resolved;
	const { target, config, credential } = resolved;

	try {
		await mail.flagMessage(config, credential, {
			uid: args.uid,
			folder: args.folder,
			add: args.add,
			remove: args.remove,
		});

		logRequest({
			tokenId: token.id,
			tokenName: token.name,
			targetId: target.id,
			targetSlug: target.slug,
			type: "mail",
			method: null,
			path: `flag/${args.uid}`,
			statusCode: 200,
			clientIp: "mcp",
			durationMs: null,
		});

		return { success: true };
	} catch (err) {
		const message = err instanceof Error ? err.message : "Mail flag failed";
		logRequest({
			tokenId: token.id,
			tokenName: token.name,
			targetId: target.id,
			targetSlug: target.slug,
			type: "mail",
			method: null,
			path: `flag/${args.uid}`,
			statusCode: 500,
			clientIp: "mcp",
			durationMs: null,
		});
		return { error: message };
	}
}
