import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireBearer } from "$lib/server/api-auth";
import { ipMatchesAny } from "$lib/server/utils/cidr";
import { getTargetBySlug } from "$lib/server/services/targets";
import { hasPermission } from "$lib/server/services/permissions";
import { getDefaultAuthMethod } from "$lib/server/services/auth-methods";
import { executeCommand } from "$lib/server/services/ssh";
import type { SshConfig } from "$lib/server/db/schema";

export const POST: RequestHandler = async ({ request, params, getClientAddress }) => {
	const token = await requireBearer(request);

	// IP whitelist check
	if (token.allowedIps && token.allowedIps.length > 0) {
		const clientIp = getClientAddress();
		if (!ipMatchesAny(clientIp, token.allowedIps)) {
			throw error(403, "IP not allowed");
		}
	}

	const target = await getTargetBySlug(params.target);
	if (!target || !target.enabled) {
		throw error(404, "target not found");
	}

	if (target.type !== "ssh") {
		throw error(400, "target is not an SSH target");
	}

	const permitted = await hasPermission(token.id, target.id);
	if (!permitted) {
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

	const timeoutMs = typeof body.timeout === "number" ? body.timeout * 1000 : undefined;

	try {
		const result = await executeCommand(config, authMethod.credential, body.command, timeoutMs);
		return Response.json(result);
	} catch (err) {
		const message = err instanceof Error ? err.message : "SSH execution failed";
		if (message.includes("timed out")) {
			return Response.json({ error: message }, { status: 408 });
		}
		return Response.json({ error: message }, { status: 502 });
	}
};
