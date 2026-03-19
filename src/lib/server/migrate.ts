import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db } from "$lib/server/db";

export async function runMigrations() {
	try {
		console.log("[shellgate] Running database migrations...");
		await migrate(db, { migrationsFolder: "./drizzle" });
		console.log("[shellgate] Migrations complete.");
	} catch (err) {
		console.error("[shellgate] ❌ Migration failed:", err);
		console.error("[shellgate] DATABASE_URL reachable? Exiting.");
		process.exit(1);
	}
}
