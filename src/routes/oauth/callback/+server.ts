import { redirect } from "@sveltejs/kit";
import { getProviderById } from "$lib/server/services/integration-providers";
import { connectAccount } from "$lib/server/services/connected-accounts";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ url, cookies }) => {
	const code = url.searchParams.get("code");
	const state = url.searchParams.get("state");
	const errorParam = url.searchParams.get("error");

	if (errorParam) {
		redirect(303, `/integrations?error=${encodeURIComponent(errorParam)}`);
	}

	if (!code || !state) {
		redirect(303, "/integrations?error=missing_params");
	}

	// Validate state
	const stateCookie = cookies.get("oauth_state");
	if (!stateCookie) {
		redirect(303, "/integrations?error=invalid_state");
	}

	let storedState: { state: string; providerId: string };
	try {
		storedState = JSON.parse(stateCookie);
	} catch {
		redirect(303, "/integrations?error=invalid_state");
	}

	if (storedState.state !== state) {
		redirect(303, "/integrations?error=invalid_state");
	}

	cookies.delete("oauth_state", { path: "/" });

	const provider = await getProviderById(storedState.providerId);
	if (!provider) {
		redirect(303, "/integrations?error=provider_not_found");
	}

	// Exchange code for tokens
	const redirectUri = `${url.origin}/oauth/callback`;

	const tokenResponse = await fetch(provider.tokenUrl, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			client_id: provider.clientId,
			client_secret: provider.clientSecret,
			code,
			redirect_uri: redirectUri,
			grant_type: "authorization_code",
		}),
	});

	if (!tokenResponse.ok) {
		const body = await tokenResponse.text();
		console.error("[oauth] token exchange failed:", body);
		redirect(303, "/integrations?error=token_exchange_failed");
	}

	const tokenData = await tokenResponse.json();
	const accessToken = tokenData.access_token as string;
	const refreshToken = tokenData.refresh_token as string;
	const expiresIn = (tokenData.expires_in as number) || 3600;

	// Fetch user profile from Graph API to get email
	const profileResponse = await fetch("https://graph.microsoft.com/v1.0/me", {
		headers: { Authorization: `Bearer ${accessToken}` },
	});

	let email = "unknown";
	let displayName: string | undefined;

	if (profileResponse.ok) {
		const profile = await profileResponse.json();
		email = profile.mail || profile.userPrincipalName || "unknown";
		displayName = profile.displayName;
	}

	await connectAccount({
		providerId: provider.id,
		email,
		displayName,
		accessToken,
		refreshToken,
		tokenExpiresAt: new Date(Date.now() + expiresIn * 1000),
	});

	redirect(303, "/integrations?success=connected");
};
