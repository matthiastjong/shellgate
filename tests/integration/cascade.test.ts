import { beforeEach, describe, expect, it } from "vitest";
import { hasPermission } from "$lib/server/services/permissions";
import { listAuthMethods } from "$lib/server/services/auth-methods";
import { deleteTarget, getTargetById } from "$lib/server/services/targets";
import { revokeToken } from "$lib/server/services/tokens";
import {
	createTestToken,
	createTestTarget,
	createTestAuthMethod,
	grantPermission,
	truncateAll,
} from "../helpers";

describe("cascade deletes", () => {
	beforeEach(async () => {
		await truncateAll();
	});

	it("deleting target removes its permissions", async () => {
		const { token: tokenRow } = await createTestToken();
		const target = await createTestTarget();
		await grantPermission(tokenRow.id, target.id);

		expect(await hasPermission(tokenRow.id, target.id)).toBe(true);

		await deleteTarget(target.id);

		expect(await hasPermission(tokenRow.id, target.id)).toBe(false);
	});

	it("deleting target removes its auth methods", async () => {
		const target = await createTestTarget();
		await createTestAuthMethod(target.id, { label: "Key 1" });
		await createTestAuthMethod(target.id, { label: "Key 2", isDefault: false });

		const methodsBefore = await listAuthMethods(target.id);
		expect(methodsBefore).toHaveLength(2);

		await deleteTarget(target.id);

		const methodsAfter = await listAuthMethods(target.id);
		expect(methodsAfter).toHaveLength(0);
	});

	it("revoking token does not affect target or its auth methods", async () => {
		const { token: tokenRow } = await createTestToken();
		const target = await createTestTarget();
		await createTestAuthMethod(target.id);
		await grantPermission(tokenRow.id, target.id);

		await revokeToken(tokenRow.id);

		const targetAfter = await getTargetById(target.id);
		expect(targetAfter).not.toBeNull();

		const methods = await listAuthMethods(target.id);
		expect(methods).toHaveLength(1);
	});
});
