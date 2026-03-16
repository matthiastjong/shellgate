import { fail, redirect } from "@sveltejs/kit";
import { dev } from "$app/environment";
import { env } from "$env/dynamic/private";
import { createSession } from "$lib/server/auth";
import type { Actions } from "./$types";

export const actions = {
	default: async ({ request, cookies }) => {
		const data = await request.formData();
		const email = data.get("email")?.toString() ?? "";
		const password = data.get("password")?.toString() ?? "";

		if (email !== env.ADMIN_EMAIL || password !== env.ADMIN_PASSWORD) {
			return fail(401, { error: "Invalid credentials" });
		}

		const session = createSession(email, env.ADMIN_PASSWORD ?? "");
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
