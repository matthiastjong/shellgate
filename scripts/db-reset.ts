import postgres from "postgres";
import * as readline from "node:readline/promises";

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
	console.error("ERROR: DATABASE_URL environment variable is not set.");
	process.exit(1);
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

console.log("\n⚠️  WARNING: This will DELETE ALL DATA from the database.");
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
	await sql`TRUNCATE token_permissions, target_auth_methods, tokens, targets, users CASCADE`;
	console.log("\nDatabase wiped. All data has been removed.");
	console.log("Restart the app to begin setup from scratch.");
} catch (err) {
	console.error("Failed to reset database:", err);
	process.exit(1);
} finally {
	await sql.end();
}
