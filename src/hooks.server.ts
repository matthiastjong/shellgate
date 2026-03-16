import type { Handle } from "@sveltejs/kit";
import { redirect } from "@sveltejs/kit";
import { env } from "$env/dynamic/private";
import { validateSession } from "$lib/server/auth";

export const handle: Handle = async ({ event, resolve }) => {
	const { pathname } = event.url;

	if (
		pathname.startsWith("/login") ||
		pathname.startsWith("/api/") ||
		pathname.startsWith("/gateway/") ||
		pathname.startsWith("/_app/") ||
		pathname === "/favicon.ico"
	) {
		return resolve(event);
	}

	const session = event.cookies.get("session");
	if (!session || !validateSession(session, env.ADMIN_PASSWORD ?? "")) {
		redirect(303, "/login");
	}

	return resolve(event);
};
