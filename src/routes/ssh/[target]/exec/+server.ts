import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireBearer } from "$lib/server/api-auth";
import { ipMatchesAny } from "$lib/server/utils/cidr";
import { getTargetBySlug } from "$lib/server/services/targets";
import { hasPermission } from "$lib/server/services/permissions";
import { getDefaultAuthMethod } from "$lib/server/services/auth-methods";
import { executeCommand } from "$lib/server/services/ssh";
import { logRequest } from "$lib/server/services/audit";
import { normalizeSshRequest, checkRequest } from "$lib/server/guard";
import type { SshConfig } from "$lib/server/db/schema";

export const POST: RequestHandler = async ({ request, params, getClientAddress }) => {
	const token = await requireBearer(request);
	const clientIp = getClientAddress();

	// IP whitelist check
	if (token.allowedIps && token.allowedIps.length > 0) {
		if (!ipMatchesAny(clientIp, token.allowedIps)) {
			logRequest({
				tokenId: token.id,
				tokenName: token.name,
				targetId: null,
				targetSlug: params.target,
				type: "ssh",
				method: null,
				path: null,
				statusCode: 403,
				clientIp,
				durationMs: null,
			});
			throw error(403, "IP not allowed");
		}
	}

	const target = await getTargetBySlug(params.target);
	if (!target || !target.enabled) {
		logRequest({
			tokenId: token.id,
			tokenName: token.name,
			targetId: null,
			targetSlug: params.target,
			type: "ssh",
			method: null,
			path: null,
			statusCode: 404,
			clientIp,
			durationMs: null,
		});
		throw error(404, "target not found");
	}

	if (target.type !== "ssh") {
		throw error(400, "target is not an SSH target");
	}

	const permitted = await hasPermission(token.id, target.id);
	if (!permitted) {
		logRequest({
			tokenId: token.id,
			tokenName: token.name,
			targetId: target.id,
			targetSlug: target.slug,
			type: "ssh",
			method: null,
			path: null,
			statusCode: 403,
			clientIp,
			durationMs: null,
		});
		throw error(403, "forbidden");
	}

	const config = target.config as SshConfig | null;
	if (!config?.host || !config?.username) {
		throw error(400, "target has no SSH configuration");
	}

	const authMethod = await getDefaultAuthMethod(target.id);
	if (!authMethod || authMethod.type !== "ssh_key") {
		throw error(400, "target has no SSH key configured");
	}

	const body = await request.json().catch(() => null);
	if (!body || typeof body.command !== "string" || !body.command.trim()) {
		throw error(400, "command is required");
	}

	// Guard check
	const isApproved = request.headers.get("X-Shellgate-Approved") === "true";

	if (!isApproved) {
		const normalized = normalizeSshRequest(body.command);
		const guardResult = await checkRequest(normalized);

		if (guardResult.action === "block") {
			logRequest({
				tokenId: token.id,
				tokenName: token.name,
				targetId: target.id,
				targetSlug: target.slug,
				type: "ssh",
				method: null,
				path: body.command,
				statusCode: 403,
				clientIp,
				durationMs: null,
				guardAction: "block",
				guardReason: guardResult.reason,
			});
			throw error(403, guardResult.reason);
		}

		if (guardResult.action === "approval_required") {
			logRequest({
				tokenId: token.id,
				tokenName: token.name,
				targetId: target.id,
				targetSlug: target.slug,
				type: "ssh",
				method: null,
				path: body.command,
				statusCode: 202,
				clientIp,
				durationMs: null,
				guardAction: "approval_required",
				guardReason: guardResult.reason,
			});
			return Response.json(
				{
					status: "approval_required",
					reason: guardResult.reason,
					matched: guardResult.matched,
					request: { type: "ssh", command: body.command },
				},
				{ status: 202 },
			);
		}
	}

	const timeoutMs = typeof body.timeout === "number" ? body.timeout * 1000 : undefined;

	try {
		const result = await executeCommand(config, authMethod.credential, body.command, timeoutMs);

		logRequest({
			tokenId: token.id,
			tokenName: token.name,
			targetId: target.id,
			targetSlug: target.slug,
			type: "ssh",
			method: null,
			path: body.command,
			statusCode: result.exitCode,
			clientIp,
			durationMs: result.durationMs,
			guardAction: isApproved ? "approved" : "allow",
		});

		return Response.json(result);
	} catch (err) {
		const message = err instanceof Error ? err.message : "SSH execution failed";
		const statusCode = message.includes("timed out") ? 408 : 502;

		logRequest({
			tokenId: token.id,
			tokenName: token.name,
			targetId: target.id,
			targetSlug: target.slug,
			type: "ssh",
			method: null,
			path: body.command,
			statusCode,
			clientIp,
			durationMs: null,
			guardAction: isApproved ? "approved" : "allow",
		});

		return Response.json({ error: message }, { status: statusCode });
	}
};
