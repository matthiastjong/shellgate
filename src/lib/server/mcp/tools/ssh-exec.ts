import type { Token } from "$lib/server/db/schema";
import type { SshConfig } from "$lib/server/db/schema";
import { getTargetBySlug } from "$lib/server/services/targets";
import { hasPermission } from "$lib/server/services/permissions";
import { getDefaultAuthMethod } from "$lib/server/services/auth-methods";
import { executeCommand } from "$lib/server/services/ssh";
import { logRequest } from "$lib/server/services/audit";
import { normalizeSshRequest, checkRequest } from "$lib/server/guard";

export interface SshExecArgs {
	target: string;
	command: string;
	timeout?: number;
	approved?: boolean;
}

export async function sshExec(token: Token, args: SshExecArgs) {
	const { target: targetSlug, command, timeout, approved = false } = args;

	if (typeof command !== "string" || !command.trim()) {
		return { error: "command is required" };
	}

	const target = await getTargetBySlug(targetSlug);
	if (!target || !target.enabled) {
		return { error: "target not found" };
	}

	if (target.type !== "ssh") {
		return { error: "target is not an SSH target" };
	}

	const permitted = await hasPermission(token.id, target.id);
	if (!permitted) {
		return { error: "forbidden" };
	}

	const config = target.config as SshConfig | null;
	if (!config?.host || !config?.username) {
		return { error: "target has no SSH configuration" };
	}

	const authMethod = await getDefaultAuthMethod(target.id);
	if (!authMethod || authMethod.type !== "ssh_key") {
		return { error: "target has no SSH key configured" };
	}

	// Guard check (unless pre-approved)
	if (!approved) {
		const normalized = normalizeSshRequest(command);
		const guardResult = await checkRequest(normalized);

		if (guardResult.action === "block") {
			logRequest({
				tokenId: token.id,
				tokenName: token.name,
				targetId: target.id,
				targetSlug: target.slug,
				type: "ssh",
				method: null,
				path: command,
				statusCode: 403,
				clientIp: "mcp",
				durationMs: null,
				guardAction: "block",
				guardReason: guardResult.reason,
			});
			return {
				status: "blocked",
				reason: guardResult.reason,
				matched: guardResult.matched,
			};
		}

		if (guardResult.action === "approval_required") {
			logRequest({
				tokenId: token.id,
				tokenName: token.name,
				targetId: target.id,
				targetSlug: target.slug,
				type: "ssh",
				method: null,
				path: command,
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
				request: { target: targetSlug, command, timeout },
				next_action:
					"STOP. Do NOT re-send this request yet. Present the command to the user, explain what it does and why it was flagged. Wait for the user to explicitly approve. Only then re-call this SAME tool with all the SAME parameters (target, command, timeout) AND set approved: true. If the user denies, abort. Never auto-approve.",
			};
		}
	}

	const timeoutMs = typeof timeout === "number" ? Math.min(timeout, 60) * 1000 : undefined;

	try {
		const result = await executeCommand(config, authMethod.credential, command, timeoutMs);

		logRequest({
			tokenId: token.id,
			tokenName: token.name,
			targetId: target.id,
			targetSlug: target.slug,
			type: "ssh",
			method: null,
			path: command,
			statusCode: result.exitCode,
			clientIp: "mcp",
			durationMs: result.durationMs,
			guardAction: approved ? "approved" : "allow",
		});

		return {
			exitCode: result.exitCode,
			stdout: result.stdout,
			stderr: result.stderr,
			durationMs: result.durationMs,
		};
	} catch (err) {
		const message = err instanceof Error ? err.message : "SSH execution failed";

		logRequest({
			tokenId: token.id,
			tokenName: token.name,
			targetId: target.id,
			targetSlug: target.slug,
			type: "ssh",
			method: null,
			path: command,
			statusCode: 502,
			clientIp: "mcp",
			durationMs: null,
			guardAction: approved ? "approved" : "allow",
		});

		return { error: message };
	}
}
