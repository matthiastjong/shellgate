import { error } from "@sveltejs/kit";
import { env } from "$env/dynamic/private";
import { findTokenByHash, updateLastUsed } from "./services/tokens";
import { hashToken } from "./services/tokens";

export function requireAdmin(request: Request) {
	const header = request.headers.get("Authorization");
	if (!header?.startsWith("Basic ")) throw error(401, "Unauthorized");
	const decoded = atob(header.slice(6));
	const [email, password] = decoded.split(":");
	if (email !== env.ADMIN_EMAIL || password !== env.ADMIN_PASSWORD) {
		throw error(401, "Unauthorized");
	}
}

export async function requireBearer(request: Request) {
	const header = request.headers.get("Authorization");
	if (!header?.startsWith("Bearer sg_")) throw error(401, "Unauthorized");
	const hash = hashToken(header.slice(7));
	const token = await findTokenByHash(hash);
	if (!token) throw error(401, "Unauthorized");
	await updateLastUsed(token.id);
	return token;
}
