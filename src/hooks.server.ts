import type { Handle } from "@sveltejs/kit";
import { redirect } from "@sveltejs/kit";
import { countUsers, getUserByEmail } from "$lib/server/services/users";
import { validateSession } from "$lib/server/auth";
import { checkHasTokens } from "$lib/server/cache";
import { runMigrations } from "$lib/server/migrate";

const migrationPromise = runMigrations();

let hasUsers: boolean | null = null;
let lastCheck = 0;
const CHECK_TTL_MS = 60_000;

async function checkHasUsers(): Promise<boolean> {
	const now = Date.now();
	if (hasUsers !== null && now - lastCheck < CHECK_TTL_MS) return hasUsers;
	const count = await countUsers();
	hasUsers = count > 0;
	lastCheck = now;
	return hasUsers;
}

export const handle: Handle = async ({ event, resolve }) => {
	await migrationPromise;

	const { pathname } = event.url;

	if (
		pathname.startsWith("/api/") ||
		pathname.startsWith("/gateway/") ||
		pathname.startsWith("/discovery") ||
		pathname.startsWith("/verify-connection") ||
		pathname.startsWith("/health") ||
		pathname.startsWith("/_app/") ||
		pathname === "/favicon.ico"
	) {
		event.locals.user = null;
		return resolve(event);
	}

	const usersExist = await checkHasUsers();

	if (!usersExist) {
		event.locals.user = null;
		if (!pathname.startsWith("/setup")) {
			redirect(303, "/setup");
		}
		return resolve(event);
	}

	if (pathname.startsWith("/setup")) {
		redirect(303, "/login");
	}

	if (pathname.startsWith("/login")) {
		event.locals.user = null;
		return resolve(event);
	}

	const session = event.cookies.get("session");
	if (!session || !validateSession(session)) {
		event.locals.user = null;
		redirect(303, "/login");
	}

	const payload = session!.slice(0, session!.lastIndexOf("."));
	const email = payload.split(":")[0];
	const user = await getUserByEmail(email);
	if (!user) {
		event.cookies.set("session", "", { path: "/", maxAge: 0 });
		event.locals.user = null;
		redirect(303, "/login");
	}

	event.locals.user = { id: user.id, email: user.email };

	// Onboarding redirect: if no API keys exist, force onboarding
	if (
		!pathname.startsWith("/onboarding") &&
		!pathname.startsWith("/logout") &&
		!pathname.startsWith("/targets") &&
		!pathname.startsWith("/api-keys") &&
		!pathname.startsWith("/connect")
	) {
		const tokensExist = await checkHasTokens();
		if (!tokensExist) {
			redirect(303, "/onboarding");
		}
	}

	return resolve(event);
};
