import { redirect } from "@sveltejs/kit";
import { sql } from "drizzle-orm";
import { db } from "$lib/server/db";
import { runMigrations } from "$lib/server/migrate";
import type { Actions } from "./$types";

export const actions = {
	resetDatabase: async ({ cookies }) => {
		await db.execute(sql`DROP SCHEMA public CASCADE`);
		await db.execute(sql`CREATE SCHEMA public`);
		await db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);

		await runMigrations();

		cookies.set("session", "", { path: "/", maxAge: 0 });
		redirect(303, "/setup");
	},
} satisfies Actions;
