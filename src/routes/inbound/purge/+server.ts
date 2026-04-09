import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireAdmin } from "$lib/server/api-auth";
import { purgeOldEvents } from "$lib/server/services/inbound";

const DURATIONS: Record<string, number> = {
	"1h": 60 * 60 * 1000,
	"24h": 24 * 60 * 60 * 1000,
	"7d": 7 * 24 * 60 * 60 * 1000,
	"30d": 30 * 24 * 60 * 60 * 1000,
};

export const DELETE: RequestHandler = async ({ request, url }) => {
	await requireAdmin(request);
	const olderThan = url.searchParams.get("older_than") ?? "24h";
	const ms = DURATIONS[olderThan] ?? DURATIONS["24h"];
	const deleted = await purgeOldEvents(ms);
	return json({ ok: true, deleted });
};
