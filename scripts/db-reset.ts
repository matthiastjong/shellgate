import postgres from "postgres";
import * as readline from "node:readline/promises";

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
	console.error("ERROR: DATABASE_URL environment variable is not set.");
	process.exit(1);
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

console.log("\n⚠️  WARNING: This will DROP ALL TABLES and re-run migrations.");
console.log("   All data will be permanently lost.");
console.log("   The app will be reset to its initial setup stage.");
console.log("   This action is IRREVERSIBLE.\n");

const answer = await rl.question("Type 'yes' to confirm: ");
rl.close();

if (answer.trim().toLowerCase() !== "yes") {
	console.log("Aborted.");
	process.exit(0);
}

const sql = postgres(DATABASE_URL);

try {
	await sql`DROP SCHEMA public CASCADE`;
	await sql`CREATE SCHEMA public`;
	await sql`DROP SCHEMA IF EXISTS drizzle CASCADE`;
	console.log("\nAll tables dropped.");
} catch (err) {
	console.error("Failed to reset database:", err);
	process.exit(1);
} finally {
	await sql.end();
}
