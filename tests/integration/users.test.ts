import { beforeEach, describe, expect, it } from "vitest";
import { countUsers, createUser, verifyUser } from "$lib/server/services/users";
import { truncateAll } from "../helpers";

describe("users", () => {
	beforeEach(async () => {
		await truncateAll();
	});

	it("creates user and verifies correct password", async () => {
		const user = await createUser("admin@test.com", "password123");
		expect(user.email).toBe("admin@test.com");
		expect(user.id).toBeDefined();

		const verified = await verifyUser("admin@test.com", "password123");
		expect(verified).not.toBeNull();
		expect(verified!.id).toBe(user.id);
	});

	it("verifyUser returns null for wrong password", async () => {
		await createUser("admin@test.com", "password123");
		const result = await verifyUser("admin@test.com", "wrongpassword");
		expect(result).toBeNull();
	});

	it("verifyUser returns null for nonexistent email", async () => {
		const result = await verifyUser("nobody@test.com", "password123");
		expect(result).toBeNull();
	});

	it("countUsers reflects actual count", async () => {
		expect(await countUsers()).toBe(0);
		await createUser("one@test.com", "password123");
		expect(await countUsers()).toBe(1);
		await createUser("two@test.com", "password123");
		expect(await countUsers()).toBe(2);
	});

	it("rejects duplicate email", async () => {
		await createUser("admin@test.com", "password123");
		await expect(createUser("admin@test.com", "password456")).rejects.toThrow();
	});
});
