import type { Token } from "$lib/server/db/schema";
import { resolveGatewayTarget, proxyToTarget } from "$lib/server/services/gateway";
import { normalizeApiRequest, checkRequest } from "$lib/server/guard";
import { logRequest } from "$lib/server/services/audit";

const DEFAULT_MAX_BYTES = 20_000_000;
const HARD_MAX_BYTES = 20_000_000;
const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export interface ApiDownloadArgs {
	target: string;
	path: string;
	maxBytes?: number;
	approved?: boolean;
}

function sanitizeMaxBytes(maxBytes?: number) {
	if (maxBytes === undefined) return DEFAULT_MAX_BYTES;
	if (!Number.isFinite(maxBytes) || maxBytes <= 0) return DEFAULT_MAX_BYTES;
	return Math.min(Math.floor(maxBytes), HARD_MAX_BYTES);
}

function contentTypeBase(contentType: string) {
	return contentType.split(";")[0].trim().toLowerCase();
}

function filenameFromPath(path: string, contentType: string) {
	const cleanPath = path.split("?")[0];
	const lastSegment = cleanPath.split("/").filter(Boolean).at(-1);
	if (lastSegment && /\.[a-z0-9]+$/i.test(lastSegment)) return lastSegment;

	const ext = contentTypeBase(contentType).replace("image/", "").replace("jpeg", "jpg");
	return `download.${ext || "img"}`;
}

export async function apiDownload(token: Token, args: ApiDownloadArgs) {
	const { target: targetSlug, path, approved = false } = args;
	const maxBytes = sanitizeMaxBytes(args.maxBytes);
	const method = "GET";

	const resolved = await resolveGatewayTarget(token, targetSlug);
	if ("error" in resolved) {
		const errBody = await resolved.error.json().catch(() => ({ error: "unknown error" }));
		throw new Error(errBody.error ?? "Failed to resolve target");
	}

	const { target } = resolved;

	if (!approved) {
		const guardResult = await checkRequest(normalizeApiRequest(method, path));

		if (guardResult.action === "block") {
			logRequest({
				tokenId: token.id,
				tokenName: token.name,
				targetId: target.id,
				targetSlug: target.slug,
				type: "gateway",
				method,
				path,
				statusCode: 403,
				clientIp: "mcp",
				durationMs: null,
				guardAction: "block",
				guardReason: guardResult.reason,
			});
			return { error: "download_failed", reason: guardResult.reason, matched: guardResult.matched };
		}

		if (guardResult.action === "approval_required") {
			logRequest({
				tokenId: token.id,
				tokenName: token.name,
				targetId: target.id,
				targetSlug: target.slug,
				type: "gateway",
				method,
				path,
				statusCode: 202,
				clientIp: "mcp",
				durationMs: null,
				guardAction: "approval_required",
				guardReason: guardResult.reason,
			});
			return {
				status: "approval_required",
				reason: guardResult.reason,
				matched: guardResult.matched,
				request: { target: targetSlug, path, maxBytes },
				next_action:
					"STOP. Do NOT re-send this request yet. Present the reason to the user and wait for explicit approval. Only then re-call this SAME tool with approved: true.",
			};
		}
	}

	const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
	const requestUrl = `http://mcp-internal/gateway/${targetSlug}/${normalizedPath}`;
	const proxyRequest = new Request(requestUrl, {
		method,
		headers: new Headers({ Accept: "image/png,image/jpeg,image/webp" }),
	});

	const start = Date.now();
	const response = await proxyToTarget(target, normalizedPath, proxyRequest);
	const durationMs = Date.now() - start;

	logRequest({
		tokenId: token.id,
		tokenName: token.name,
		targetId: target.id,
		targetSlug: target.slug,
		type: "gateway",
		method,
		path,
		statusCode: response.status,
		clientIp: "mcp",
		durationMs,
		guardAction: approved ? "approved" : "allow",
	});

	if (response.status === 401 || response.status === 403) {
		return { error: "unauthorized", status: response.status };
	}

	if (!response.ok) {
		return { error: "download_failed", status: response.status };
	}

	const contentType = response.headers.get("content-type") ?? "";
	if (!ALLOWED_IMAGE_TYPES.has(contentTypeBase(contentType))) {
		return { error: "not_image", contentType: contentType || null };
	}

	const contentLength = Number(response.headers.get("content-length"));
	if (Number.isFinite(contentLength) && contentLength > maxBytes) {
		return { error: "too_large", maxBytes, contentLength };
	}

	const bytes = Buffer.from(await response.arrayBuffer());
	if (bytes.byteLength > maxBytes) {
		return { error: "too_large", maxBytes, contentLength: bytes.byteLength };
	}

	return {
		contentType: contentTypeBase(contentType),
		filename: filenameFromPath(path, contentType),
		byteLength: bytes.byteLength,
		base64: bytes.toString("base64"),
	};
}
