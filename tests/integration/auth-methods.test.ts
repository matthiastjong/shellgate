import { beforeEach, describe, expect, it } from "vitest";
import {
	createAuthMethod,
	listAuthMethods,
	updateAuthMethod,
} from "$lib/server/services/auth-methods";
import { createTestTarget, createTestAuthMethod, truncateAll } from "../helpers";

describe("auth method default toggling", () => {
	beforeEach(async () => {
		await truncateAll();
	});

	it("setting default unsets previous default", async () => {
		const target = await createTestTarget();

		const methodA = await createTestAuthMethod(target.id, {
			label: "Key A",
			isDefault: true,
		});
		const methodB = await createTestAuthMethod(target.id, {
			label: "Key B",
			isDefault: true,
		});

		const methods = await listAuthMethods(target.id);
		const a = methods.find((m) => m.id === methodA.id);
		const b = methods.find((m) => m.id === methodB.id);

		expect(a!.isDefault).toBe(false);
		expect(b!.isDefault).toBe(true);
	});

	it("updating to default unsets others", async () => {
		const target = await createTestTarget();

		const methodA = await createTestAuthMethod(target.id, {
			label: "Key A",
			isDefault: true,
		});
		const methodB = await createTestAuthMethod(target.id, {
			label: "Key B",
			isDefault: false,
		});

		await updateAuthMethod(target.id, methodB.id, { isDefault: true });

		const methods = await listAuthMethods(target.id);
		const a = methods.find((m) => m.id === methodA.id);
		const b = methods.find((m) => m.id === methodB.id);

		expect(a!.isDefault).toBe(false);
		expect(b!.isDefault).toBe(true);
	});

	it("accepts basic type", async () => {
		const target = await createTestTarget();

		const method = await createAuthMethod(target.id, {
			label: "Basic Auth",
			type: "basic",
			credential: "admin:password123",
			isDefault: false,
		});

		expect(method.type).toBe("basic");
	});

	it("accepts custom_header type", async () => {
		const target = await createTestTarget();

		const method = await createAuthMethod(target.id, {
			label: "Custom Header",
			type: "custom_header",
			credential: "X-API-Key: my-secret",
			isDefault: false,
		});

		expect(method.type).toBe("custom_header");
	});

	it("rejects invalid type", async () => {
		const target = await createTestTarget();

		await expect(
			createAuthMethod(target.id, {
				label: "Invalid",
				type: "oauth2",
				credential: "token",
				isDefault: false,
			}),
		).rejects.toThrow("type must be one of");
	});

	it("generates correct credential hint", async () => {
		const target = await createTestTarget();

		const method = await createAuthMethod(target.id, {
			label: "Test",
			type: "bearer",
			credential: "sk-1234567890abcdef",
			isDefault: false,
		});

		expect(method.credentialHint).toBe("sk-••••••••cdef");
	});
});
