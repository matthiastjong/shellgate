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
	const tables = await sql<{ table_name: string }[]>`
		SELECT table_name FROM information_schema.tables
		WHERE table_schema = 'public'
		  AND table_type = 'BASE TABLE'
		  AND table_name != '__drizzle_migrations'
	`;

	if (tables.length === 0) {
		console.log("No tables found to truncate.");
		process.exit(0);
	}

	const tableNames = tables.map((t) => t.table_name).join(", ");
	await sql.unsafe(`TRUNCATE ${tableNames} CASCADE`);
	console.log(`\nDatabase wiped. Truncated: ${tableNames}`);
	console.log("Restart the app to begin setup from scratch.");
} catch (err) {
	console.error("Failed to reset database:", err);
	process.exit(1);
} finally {
	await sql.end();
}
