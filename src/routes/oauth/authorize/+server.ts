import { redirect } from "@sveltejs/kit";
import { randomBytes } from "node:crypto";
import { getProviderById } from "$lib/server/services/integration-providers";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ url, cookies }) => {
	const providerId = url.searchParams.get("provider");
	if (!providerId) {
		return Response.json({ error: "provider parameter required" }, { status: 400 });
	}

	const provider = await getProviderById(providerId);
	if (!provider || !provider.enabled) {
		return Response.json({ error: "provider not found or disabled" }, { status: 404 });
	}

	const state = randomBytes(32).toString("hex");
	cookies.set("oauth_state", JSON.stringify({ state, providerId }), {
		path: "/",
		httpOnly: true,
		sameSite: "lax",
		maxAge: 600, // 10 minutes
	});

	const redirectUri = `${url.origin}/oauth/callback`;

	const authUrl = new URL(provider.authUrl);
	authUrl.searchParams.set("client_id", provider.clientId);
	authUrl.searchParams.set("response_type", "code");
	authUrl.searchParams.set("redirect_uri", redirectUri);
	authUrl.searchParams.set("scope", provider.scopes);
	authUrl.searchParams.set("state", state);
	authUrl.searchParams.set("response_mode", "query");
	authUrl.searchParams.set("prompt", "consent");

	redirect(302, authUrl.toString());
};
