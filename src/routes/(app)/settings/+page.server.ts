import { redirect, fail } from "@sveltejs/kit";
import { sql } from "drizzle-orm";
import { db } from "$lib/server/db";
import { runMigrations } from "$lib/server/migrate";
import { listProviders, createProvider, updateProvider, deleteProvider } from "$lib/server/services/integration-providers";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async () => {
	const providers = await listProviders();
	return { providers };
};

export const actions = {
	resetDatabase: async ({ cookies }) => {
		await db.execute(sql`DROP SCHEMA public CASCADE`);
		await db.execute(sql`CREATE SCHEMA public`);
		await db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);

		await runMigrations();

		cookies.set("session", "", { path: "/", maxAge: 0 });
		redirect(303, "/setup");
	},

	createProvider: async ({ request }) => {
		const form = await request.formData();
		const name = form.get("name") as string;
		const type = form.get("type") as string;
		const clientId = form.get("clientId") as string;
		const clientSecret = form.get("clientSecret") as string;
		const scopes = form.get("scopes") as string;
		const authUrl = form.get("authUrl") as string;
		const tokenUrl = form.get("tokenUrl") as string;

		if (!name || !type || !clientId || !clientSecret || !scopes || !authUrl || !tokenUrl) {
			return fail(400, { error: "All fields are required" });
		}

		await createProvider({ name, type, clientId, clientSecret, scopes, authUrl, tokenUrl });
		return { success: true };
	},

	updateProvider: async ({ request }) => {
		const form = await request.formData();
		const id = form.get("id") as string;
		const clientId = form.get("clientId") as string;
		const clientSecret = form.get("clientSecret") as string;
		const scopes = form.get("scopes") as string;

		if (!id) return fail(400, { error: "Provider ID required" });

		const data: Record<string, string> = {};
		if (clientId) data.clientId = clientId;
		if (clientSecret) data.clientSecret = clientSecret;
		if (scopes) data.scopes = scopes;

		await updateProvider(id, data);
		return { success: true };
	},

	deleteProvider: async ({ request }) => {
		const form = await request.formData();
		const id = form.get("id") as string;
		if (!id) return fail(400, { error: "Provider ID required" });
		await deleteProvider(id);
		return { success: true };
	},
} satisfies Actions;
