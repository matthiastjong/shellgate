import { error } from "@sveltejs/kit";
import { requireBearer } from "$lib/server/api-auth";
import { getTargetBySlug } from "$lib/server/services/targets";
import { hasPermission } from "$lib/server/services/permissions";
import { getDefaultAuthMethod } from "$lib/server/services/auth-methods";
import type { EmailConfig } from "$lib/server/db/schema";

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
