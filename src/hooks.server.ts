import type { Handle } from "@sveltejs/kit";
import { redirect } from "@sveltejs/kit";
import { countUsers, getUserByEmail } from "$lib/server/services/users";
import { validateSession } from "$lib/server/auth";

let hasUsers: boolean | null = null;

async function checkHasUsers(): Promise<boolean> {
	if (hasUsers === true) return true;
	const count = await countUsers();
	hasUsers = count > 0;
	return hasUsers;
}

export const handle: Handle = async ({ event, resolve }) => {
	const { pathname } = event.url;

	if (
		pathname.startsWith("/api/") ||
		pathname.startsWith("/gateway/") ||
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
	return resolve(event);
};
