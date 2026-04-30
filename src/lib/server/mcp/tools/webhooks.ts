import type { Token } from "$lib/server/db/schema";
import { getPendingEvents, acknowledgeEvents } from "$lib/server/services/webhook-events";

export async function webhookPoll(token: Token) {
	const events = await getPendingEvents(token.id);
	return { events };
}

export async function webhookAck(token: Token, args: { eventIds: string[] }) {
	const { eventIds } = args;
	if (!Array.isArray(eventIds) || eventIds.length === 0) {
		return { error: "eventIds is required and must be a non-empty array of strings" };
	}
	if (!eventIds.every((id) => typeof id === "string")) {
		return { error: "eventIds must be an array of strings" };
	}
	const count = await acknowledgeEvents(token.id, eventIds);
	return { acknowledged: count };
}
