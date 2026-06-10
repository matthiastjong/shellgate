import { describe, it, expect, beforeEach } from "vitest";
import { truncateAll, createTestProvider } from "../helpers";
import {
	createProvider,
	listProviders,
	getProviderById,
	getProviderBySlug,
	getEnabledProviders,
	updateProvider,
	deleteProvider,
} from "$lib/server/services/integration-providers";

describe("integration providers service", () => {
	beforeEach(async () => {
		await truncateAll();
	});

	it("creates a provider and retrieves it by slug", async () => {
		const provider = await createProvider({
			name: "Google Workspace",
			type: "google",
			clientId: "client-id-123",
			clientSecret: "client-secret-456",
			scopes: "https://mail.google.com/ https://www.googleapis.com/auth/calendar",
			authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
			tokenUrl: "https://oauth2.googleapis.com/token",
		});

		expect(provider.id).toBeDefined();
		expect(provider.slug).toBe("google-workspace");
		expect(provider.name).toBe("Google Workspace");
		expect(provider.type).toBe("google");
		expect(provider.enabled).toBe(true);

		const found = await getProviderBySlug("google-workspace");
		expect(found).not.toBeNull();
		expect(found!.id).toBe(provider.id);
	});

	it("lists all providers", async () => {
		await createTestProvider("Provider A");
		await createTestProvider("Provider B");

		const list = await listProviders();
		expect(list).toHaveLength(2);
	});

	it("updates a provider", async () => {
		const provider = await createTestProvider();

		const updated = await updateProvider(provider.id, {
			name: "Updated Name",
			enabled: false,
		});

		expect(updated).not.toBeNull();
		expect(updated!.name).toBe("Updated Name");
		expect(updated!.slug).toBe("updated-name");
		expect(updated!.enabled).toBe(false);
	});

	it("returns null when updating non-existent provider", async () => {
		const result = await updateProvider("00000000-0000-0000-0000-000000000000", {
			name: "Nope",
		});
		expect(result).toBeNull();
	});

	it("deletes a provider", async () => {
		const provider = await createTestProvider();

		const deleted = await deleteProvider(provider.id);
		expect(deleted).not.toBeNull();
		expect(deleted!.id).toBe(provider.id);

		const found = await getProviderById(provider.id);
		expect(found).toBeNull();
	});

	it("returns null when deleting non-existent provider", async () => {
		const result = await deleteProvider("00000000-0000-0000-0000-000000000000");
		expect(result).toBeNull();
	});

	it("lists only enabled providers", async () => {
		const p1 = await createTestProvider("Enabled One");
		const p2 = await createTestProvider("Disabled One");
		await updateProvider(p2.id, { enabled: false });

		const enabled = await getEnabledProviders();
		expect(enabled).toHaveLength(1);
		expect(enabled[0].id).toBe(p1.id);
	});
});
