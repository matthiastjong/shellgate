import { env } from "$env/dynamic/private";
import { getProviderBySlug, createProvider, updateProvider } from "./services/integration-providers";

/**
 * Seed integration providers from environment variables.
 * Called once on startup after migrations.
 *
 * If OAUTH_MICROSOFT_CLIENT_ID and OAUTH_MICROSOFT_CLIENT_SECRET are set,
 * upserts the Microsoft 365 provider automatically.
 */
export async function seedProviders() {
	const clientId = env.OAUTH_MICROSOFT_CLIENT_ID;
	const clientSecret = env.OAUTH_MICROSOFT_CLIENT_SECRET;

	if (!clientId || !clientSecret) return;

	const existing = await getProviderBySlug("microsoft-365");

	if (existing) {
		// Update credentials if they changed
		if (existing.clientId !== clientId || existing.clientSecret !== clientSecret) {
			await updateProvider(existing.id, { clientId, clientSecret });
			console.log("[seed] Updated Microsoft 365 provider credentials");
		}
	} else {
		await createProvider({
			name: "Microsoft 365",
			type: "microsoft_365",
			clientId,
			clientSecret,
			scopes: "Mail.ReadWrite Mail.Send Calendars.ReadWrite offline_access User.Read",
			authUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
			tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
		});
		console.log("[seed] Created Microsoft 365 provider");
	}
}
