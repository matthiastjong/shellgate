import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { db } from "$lib/server/db";
import { sql } from "drizzle-orm";

export const GET: RequestHandler = async () => {
	try {
		await db.execute(sql`SELECT 1`);
		return json({ status: "healthy", timestamp: new Date().toISOString() });
	} catch (err) {
		console.error("[shellgate] Health check failed:", err);
		throw error(503, "Database unreachable");
	}
};
