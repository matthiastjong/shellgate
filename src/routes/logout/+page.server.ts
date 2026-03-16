import { redirect } from "@sveltejs/kit";
import type { Actions } from "./$types";

export const actions = {
	default: async ({ cookies }) => {
		cookies.set("session", "", { path: "/", maxAge: 0 });
		redirect(303, "/login");
	},
} satisfies Actions;

export const load = async ({ cookies }) => {
	cookies.set("session", "", { path: "/", maxAge: 0 });
	redirect(303, "/login");
};
