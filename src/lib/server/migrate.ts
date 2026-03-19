import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db } from "$lib/server/db";

const MAX_RETRIES = 10;
const RETRY_DELAY_MS = 3000;

async function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runMigrations() {
	for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
		try {
			console.log(`[shellgate] Running database migrations (attempt ${attempt}/${MAX_RETRIES})...`);
			await migrate(db, { migrationsFolder: "./drizzle" });
			console.log("[shellgate] Migrations complete.");
			return;
		} catch (err) {
			console.error(`[shellgate] Migration attempt ${attempt} failed:`, err);
			if (attempt < MAX_RETRIES) {
				console.log(`[shellgate] Retrying in ${RETRY_DELAY_MS / 1000}s...`);
				await sleep(RETRY_DELAY_MS);
			} else {
				console.error("[shellgate] ❌ All migration attempts failed. Exiting.");
				process.exit(1);
			}
		}
	}
}
