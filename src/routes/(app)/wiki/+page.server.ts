import type { PageServerLoad } from "./$types";
import { db } from "$lib/server/db";
import { wikiPages } from "$lib/server/db/schema";
import { desc } from "drizzle-orm";

export const load: PageServerLoad = async () => {
	const pages = await db
		.select()
		.from(wikiPages)
		.orderBy(desc(wikiPages.updatedAt))
		.limit(200);
	return { pages };
};
