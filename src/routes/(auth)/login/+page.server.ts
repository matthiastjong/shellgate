import { fail, redirect } from "@sveltejs/kit";
import { dev } from "$app/environment";
import { verifyUser } from "$lib/server/services/users";
import { createSession } from "$lib/server/auth";
import type { Actions } from "./$types";

export const actions = {
	default: async ({ request, cookies }) => {
		const data = await request.formData();
		const email = data.get("email")?.toString() ?? "";
		const password = data.get("password")?.toString() ?? "";

		const user = await verifyUser(email, password);
		if (!user) return fail(401, { error: "Invalid credentials" });

		const session = createSession(user.email);
		cookies.set("session", session, {
			path: "/",
			httpOnly: true,
			secure: !dev,
			sameSite: "lax",
			maxAge: 60 * 60 * 24 * 7,
		});

		redirect(303, "/");
	},
} satisfies Actions;
