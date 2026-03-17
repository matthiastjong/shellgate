import { fail, redirect } from "@sveltejs/kit";
import { dev } from "$app/environment";
import { countUsers, createUser } from "$lib/server/services/users";
import { createSession } from "$lib/server/auth";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async () => {
	const count = await countUsers();
	if (count > 0) redirect(303, "/login");
	return {};
};

export const actions = {
	default: async ({ request, cookies }) => {
		const count = await countUsers();
		if (count > 0) return fail(403, { error: "Setup already completed" });

		const data = await request.formData();
		const email = data.get("email")?.toString()?.trim() ?? "";
		const password = data.get("password")?.toString() ?? "";
		const confirm = data.get("confirm")?.toString() ?? "";

		if (!email) return fail(400, { error: "Email is required" });
		if (!password) return fail(400, { error: "Password is required" });
		if (password.length < 8) return fail(400, { error: "Password must be at least 8 characters" });
		if (password !== confirm) return fail(400, { error: "Passwords do not match" });

		try {
			await createUser(email, password);
		} catch (err) {
			return fail(400, { error: err instanceof Error ? err.message : "Failed to create user" });
		}

		const session = createSession(email);
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
