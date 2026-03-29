import { inject } from "vitest";

const databaseUrl = inject("databaseUrl");
process.env.DATABASE_URL = databaseUrl;
