import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { env } from "$env/dynamic/private";

let _db: ReturnType<typeof drizzle<typeof schema>> | undefined;

export function getDb() {
	if (!_db) {
		if (!env.DATABASE_URL) throw new Error("DATABASE_URL is required");
		const client = postgres(env.DATABASE_URL);
		_db = drizzle(client, { schema });
	}
	return _db;
}

export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
	get(_target, prop) {
		return (getDb() as Record<string | symbol, unknown>)[prop];
	},
});
