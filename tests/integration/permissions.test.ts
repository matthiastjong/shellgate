import { beforeEach, describe, expect, it } from "vitest";
import { addPermission, hasPermission, removePermission } from "$lib/server/services/permissions";
import { createTestToken, createTestTarget, grantPermission, truncateAll } from "../helpers";

describe("permissions", () => {
	beforeEach(async () => {
		await truncateAll();
	});

	it("throws on duplicate permission", async () => {
		const { token: tokenRow } = await createTestToken();
		const target = await createTestTarget();

		await grantPermission(tokenRow.id, target.id);

		await expect(addPermission(tokenRow.id, target.id)).rejects.toThrow(
			"permission already exists",
		);
	});

	it("hasPermission reflects grant and removal", async () => {
		const { token: tokenRow } = await createTestToken();
		const target = await createTestTarget();

		expect(await hasPermission(tokenRow.id, target.id)).toBe(false);

		await grantPermission(tokenRow.id, target.id);
		expect(await hasPermission(tokenRow.id, target.id)).toBe(true);

		await removePermission(tokenRow.id, target.id);
		expect(await hasPermission(tokenRow.id, target.id)).toBe(false);
	});
});
