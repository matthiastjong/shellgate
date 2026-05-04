import type { PageServerLoad } from "./$types";
import { listWikiPages } from "$lib/server/services/wiki";

export const load: PageServerLoad = async () => {
	const pages = await listWikiPages({ status: "all" });
	return { pages };
};
