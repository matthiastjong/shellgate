import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import { simpleParser } from "mailparser";
import type { EmailConfig } from "../db/schema";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MailCredential {
	username: string;
	password: string;
}

export interface FolderInfo {
	path: string;
	name: string;
	delimiter: string;
	specialUse?: string;
}

export interface MessageSummary {
	uid: number;
	from: string;
	to: string;
	subject: string;
	date: Date | null;
	flags: string[];
	hasAttachments: boolean;
}

export interface AttachmentMeta {
	filename: string | null;
	contentType: string;
	size: number;
}

export interface FullMessage {
	uid: number;
	from: string;
	to: string;
	cc: string;
	subject: string;
	date: Date | null;
	text: string | null;
	html: string | null;
	flags: string[];
	attachments: AttachmentMeta[];
}

export interface AttachmentContent {
	content: Buffer;
	contentType: string;
	filename: string | null;
}

export interface SendResult {
	messageId: string;
}

export interface TestConnectionResult {
	imap: boolean;
	smtp: boolean;
	error?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseCredential(credential: string): MailCredential {
	return JSON.parse(credential) as MailCredential;
}

function makeImapClient(config: EmailConfig, cred: MailCredential): ImapFlow {
	return new ImapFlow({
		host: config.imap.host,
		port: config.imap.port,
		secure: config.imap.secure,
		auth: { user: cred.username, pass: cred.password },
		logger: false,
	});
}

function envelopeAddresses(
	addrs: import("imapflow").MessageAddressObject[] | undefined,
): string {
	if (!addrs || addrs.length === 0) return "";
	return addrs
		.map((a) => (a.name ? `${a.name} <${a.address ?? ""}>` : (a.address ?? "")))
		.join(", ");
}

function hasAttachmentInStructure(
	structure: import("imapflow").MessageStructureObject | undefined,
): boolean {
	if (!structure) return false;
	if (structure.disposition === "attachment") return true;
	if (structure.childNodes) {
		return structure.childNodes.some(hasAttachmentInStructure);
	}
	return false;
}

// ---------------------------------------------------------------------------
// 1. listFolders
// ---------------------------------------------------------------------------

export async function listFolders(
	config: EmailConfig,
	credential: string,
): Promise<FolderInfo[]> {
	const cred = parseCredential(credential);
	const client = makeImapClient(config, cred);

	try {
		await client.connect();
		const mailboxes = await client.list();
		return mailboxes.map((mb) => ({
			path: mb.path,
			name: mb.name,
			delimiter: mb.delimiter ?? "/",
			specialUse: mb.specialUse ?? undefined,
		}));
	} finally {
		await client.logout();
	}
}

// ---------------------------------------------------------------------------
// 2. search
// ---------------------------------------------------------------------------

export interface SearchQuery {
	folder?: string;
	from?: string;
	to?: string;
	subject?: string;
	since?: Date;
	before?: Date;
	text?: string;
	limit?: number;
}

export async function search(
	config: EmailConfig,
	credential: string,
	query: SearchQuery,
): Promise<MessageSummary[]> {
	const cred = parseCredential(credential);
	const client = makeImapClient(config, cred);
	const folder = query.folder ?? "INBOX";
	const limit = query.limit ?? 50;

	try {
		await client.connect();

		const lock = await client.getMailboxLock(folder);
		try {
			// Build ImapFlow search criteria
			const criteria: Record<string, unknown> = {};
			if (query.from) criteria.from = query.from;
			if (query.to) criteria.to = query.to;
			if (query.subject) criteria.subject = query.subject;
			if (query.since) criteria.since = query.since;
			if (query.before) criteria.before = query.before;
			if (query.text) criteria.body = query.text;

			const searchCriteria =
				Object.keys(criteria).length > 0 ? criteria : { all: true };

			const result = await client.search(searchCriteria, { uid: true });
			const uids: number[] = result === false ? [] : result;

			if (uids.length === 0) return [];

			// Take the most recent `limit` UIDs (largest UIDs = newest)
			const slicedUids = uids.slice(-limit);

			// Build UID range string — some IMAP servers reject array-based fetch
			const uidRange = slicedUids.length === 1
				? String(slicedUids[0])
				: `${slicedUids[0]}:${slicedUids[slicedUids.length - 1]}`;

			const results: MessageSummary[] = [];

			for await (const msg of client.fetch(
				uidRange,
				{ uid: true, envelope: true, flags: true, bodyStructure: true },
				{ uid: true },
			)) {
				const env = msg.envelope;
				const hasAttachments = hasAttachmentInStructure(msg.bodyStructure);

				results.push({
					uid: msg.uid,
					from: envelopeAddresses(env?.from),
					to: envelopeAddresses(env?.to),
					subject: env?.subject ?? "",
					date: env?.date ?? null,
					flags: [...(msg.flags ?? [])],
					hasAttachments,
				});
			}

			// Return in descending date order (newest first)
			return results.reverse();
		} finally {
			lock.release();
		}
	} finally {
		await client.logout();
	}
}

// ---------------------------------------------------------------------------
// 3. getMessage
// ---------------------------------------------------------------------------

export async function getMessage(
	config: EmailConfig,
	credential: string,
	params: { uid: number; folder?: string },
): Promise<FullMessage | null> {
	const cred = parseCredential(credential);
	const client = makeImapClient(config, cred);
	const folder = params.folder ?? "INBOX";

	try {
		await client.connect();

		const lock = await client.getMailboxLock(folder);
		try {
			const msgData = await client.fetchOne(
				String(params.uid),
				{ uid: true, flags: true, source: true },
				{ uid: true },
			);

			if (!msgData || !msgData.source) return null;

			const parsed = await simpleParser(msgData.source, {});

			return {
				uid: msgData.uid,
				from: parsed.from
					? parsed.from.value
							.map((a) => (a.name ? `${a.name} <${a.address ?? ""}>` : (a.address ?? "")))
							.join(", ")
					: "",
				to: parsed.to
					? (Array.isArray(parsed.to) ? parsed.to : [parsed.to])
							.flatMap((ao) => ao.value)
							.map((a) => (a.name ? `${a.name} <${a.address ?? ""}>` : (a.address ?? "")))
							.join(", ")
					: "",
				cc: parsed.cc
					? (Array.isArray(parsed.cc) ? parsed.cc : [parsed.cc])
							.flatMap((ao) => ao.value)
							.map((a) => (a.name ? `${a.name} <${a.address ?? ""}>` : (a.address ?? "")))
							.join(", ")
					: "",
				subject: parsed.subject ?? "",
				date: parsed.date ?? null,
				text: parsed.text ?? null,
				html: typeof parsed.html === "string" ? parsed.html : null,
				flags: [...(msgData.flags ?? [])],
				attachments: (parsed.attachments ?? []).map((a) => ({
					filename: a.filename ?? null,
					contentType: a.contentType,
					size: a.size ?? 0,
				})),
			};
		} finally {
			lock.release();
		}
	} finally {
		await client.logout();
	}
}

// ---------------------------------------------------------------------------
// 4. getAttachment
// ---------------------------------------------------------------------------

export async function getAttachment(
	config: EmailConfig,
	credential: string,
	params: { uid: number; partId: number; folder?: string },
): Promise<AttachmentContent | null> {
	const cred = parseCredential(credential);
	const client = makeImapClient(config, cred);
	const folder = params.folder ?? "INBOX";

	try {
		await client.connect();

		const lock = await client.getMailboxLock(folder);
		try {
			const msgData = await client.fetchOne(
				String(params.uid),
				{ uid: true, source: true },
				{ uid: true },
			);

			if (!msgData || !msgData.source) return null;

			const parsed = await simpleParser(msgData.source, {});
			const attachments = parsed.attachments ?? [];
			const idx = params.partId - 1; // partId is 1-based

			if (idx < 0 || idx >= attachments.length) return null;

			const att = attachments[idx];
			return {
				content: att.content,
				contentType: att.contentType,
				filename: att.filename ?? null,
			};
		} finally {
			lock.release();
		}
	} finally {
		await client.logout();
	}
}

// ---------------------------------------------------------------------------
// 5. send
// ---------------------------------------------------------------------------

export interface SendParams {
	to: string | string[];
	cc?: string | string[];
	bcc?: string | string[];
	subject: string;
	text?: string;
	html?: string;
	inReplyTo?: string;
}

export async function send(
	config: EmailConfig,
	credential: string,
	params: SendParams,
): Promise<SendResult> {
	const cred = parseCredential(credential);

	const transport = nodemailer.createTransport({
		host: config.smtp.host,
		port: config.smtp.port,
		secure: config.smtp.secure,
		auth: { user: cred.username, pass: cred.password },
	});

	try {
		const info = await transport.sendMail({
			from: cred.username,
			to: params.to,
			cc: params.cc,
			bcc: params.bcc,
			subject: params.subject,
			text: params.text,
			html: params.html,
			inReplyTo: params.inReplyTo,
		});

		return { messageId: info.messageId };
	} finally {
		transport.close();
	}
}

// ---------------------------------------------------------------------------
// 6. createDraft
// ---------------------------------------------------------------------------

export interface DraftParams {
	to?: string | string[];
	subject?: string;
	text?: string;
	html?: string;
}

export async function createDraft(
	config: EmailConfig,
	credential: string,
	params: DraftParams,
): Promise<{ uid: number | null }> {
	const cred = parseCredential(credential);

	// Build raw MIME message with stream transport
	const streamTransport = nodemailer.createTransport({
		streamTransport: true,
		newline: "unix",
	});

	const info = await streamTransport.sendMail({
		from: cred.username,
		to: params.to,
		subject: params.subject,
		text: params.text,
		html: params.html,
	});

	const chunks: Buffer[] = [];
	await new Promise<void>((resolve, reject) => {
		const stream = info.message as NodeJS.ReadableStream;
		stream.on("data", (chunk: Buffer) => chunks.push(chunk));
		stream.on("end", resolve);
		stream.on("error", reject);
	});
	const rawMessage = Buffer.concat(chunks);

	// Find Drafts folder and append
	const client = makeImapClient(config, cred);
	try {
		await client.connect();

		const mailboxes = await client.list();
		const draftsMailbox = mailboxes.find(
			(mb) => mb.specialUse === "\\Drafts" || /drafts/i.test(mb.name),
		);
		const draftsPath = draftsMailbox?.path ?? "Drafts";

		const result = await client.append(draftsPath, rawMessage, ["\\Draft", "\\Seen"]);
		return { uid: (result && typeof result === "object" && "uid" in result) ? (result as { uid: number }).uid : null };
	} finally {
		await client.logout();
	}
}

// ---------------------------------------------------------------------------
// 7. moveMessage
// ---------------------------------------------------------------------------

export async function moveMessage(
	config: EmailConfig,
	credential: string,
	params: { uid: number; from: string; to: string },
): Promise<void> {
	const cred = parseCredential(credential);
	const client = makeImapClient(config, cred);

	try {
		await client.connect();

		const lock = await client.getMailboxLock(params.from);
		try {
			await client.messageMove(String(params.uid), params.to, { uid: true });
		} finally {
			lock.release();
		}
	} finally {
		await client.logout();
	}
}

// ---------------------------------------------------------------------------
// 8. flagMessage
// ---------------------------------------------------------------------------

export async function flagMessage(
	config: EmailConfig,
	credential: string,
	params: { uid: number; folder?: string; add?: string[]; remove?: string[] },
): Promise<void> {
	const cred = parseCredential(credential);
	const client = makeImapClient(config, cred);
	const folder = params.folder ?? "INBOX";

	try {
		await client.connect();

		const lock = await client.getMailboxLock(folder);
		try {
			if (params.add && params.add.length > 0) {
				await client.messageFlagsAdd(String(params.uid), params.add, { uid: true });
			}
			if (params.remove && params.remove.length > 0) {
				await client.messageFlagsRemove(String(params.uid), params.remove, { uid: true });
			}
		} finally {
			lock.release();
		}
	} finally {
		await client.logout();
	}
}

// ---------------------------------------------------------------------------
// 9. testConnection
// ---------------------------------------------------------------------------

export async function testConnection(
	config: EmailConfig,
	credential: string,
): Promise<TestConnectionResult> {
	const cred = parseCredential(credential);
	let imapOk = false;
	let smtpOk = false;
	let errorMessage: string | undefined;

	// Test IMAP
	const imapClient = makeImapClient(config, cred);
	try {
		await imapClient.connect();
		await imapClient.logout();
		imapOk = true;
	} catch (err) {
		errorMessage = err instanceof Error ? err.message : String(err);
	}

	// Test SMTP
	const smtpTransport = nodemailer.createTransport({
		host: config.smtp.host,
		port: config.smtp.port,
		secure: config.smtp.secure,
		auth: { user: cred.username, pass: cred.password },
	});
	try {
		await smtpTransport.verify();
		smtpOk = true;
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		errorMessage = errorMessage ? `IMAP: ${errorMessage}; SMTP: ${msg}` : msg;
	} finally {
		smtpTransport.close();
	}

	return { imap: imapOk, smtp: smtpOk, error: errorMessage };
}
