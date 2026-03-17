import { error } from "@sveltejs/kit";
import { findTokenByHash, updateLastUsed } from "./services/tokens";
import { hashToken } from "./services/tokens";
import { verifyUser } from "./services/users";

export async function requireAdmin(request: Request) {
	const header = request.headers.get("Authorization");
	if (!header?.startsWith("Basic ")) throw error(401, "Unauthorized");
	const decoded = atob(header.slice(6));
	const colonIndex = decoded.indexOf(":");
	if (colonIndex === -1) throw error(401, "Unauthorized");
	const email = decoded.slice(0, colonIndex);
	const password = decoded.slice(colonIndex + 1);
	const user = await verifyUser(email, password);
	if (!user) throw error(401, "Unauthorized");
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
