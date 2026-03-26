import { beforeEach, describe, expect, it } from "vitest";
import { listPermissions } from "$lib/server/services/permissions";
import { getTargetById, updateTarget } from "$lib/server/services/targets";
import {
	createTestToken,
	createTestTarget,
	grantPermission,
	truncateAll,
} from "../helpers";

describe("discovery", () => {
	beforeEach(async () => {
		await truncateAll();
	});

	it("returns only targets the token has permission for", async () => {
		const { token } = await createTestToken();
		const target1 = await createTestTarget("Allowed API", "https://api.allowed.com");
		const target2 = await createTestTarget("Blocked API", "https://api.blocked.com");
		await grantPermission(token.id, target1.id);

		const permissions = await listPermissions(token.id);
		const targets = await Promise.all(
			permissions.map(async (p) => {
				const t = await getTargetById(p.targetId);
				return t && t.enabled ? { slug: t.slug, name: t.name, type: t.type } : null;
			})
		);
		const result = targets.filter(Boolean);

		expect(result).toHaveLength(1);
		expect(result[0]!.slug).toBe(target1.slug);
	});

	it("includes baseUrl in discovery response for api targets", async () => {
		const { token } = await createTestToken();
		const target = await createTestTarget("Semrush", "https://api.semrush.com");
		await grantPermission(token.id, target.id);

		const permissions = await listPermissions(token.id);
		const targets = await Promise.all(
			permissions.map(async (p) => {
				const t = await getTargetById(p.targetId);
				if (!t || !t.enabled) return null;
				return {
					slug: t.slug,
					name: t.name,
					type: t.type,
					...(t.type === "api" && {
						proxy: `/gateway/${t.slug}`,
						baseUrl: t.baseUrl,
					}),
				};
			})
		);
		const result = targets.filter(Boolean);

		expect(result).toHaveLength(1);
		expect(result[0]!.baseUrl).toBe("https://api.semrush.com");
		expect(result[0]!.proxy).toBe(`/gateway/${target.slug}`);
	});

	it("excludes disabled targets", async () => {
		const { token } = await createTestToken();
		const target = await createTestTarget("Disabled API", "https://api.disabled.com");
		await grantPermission(token.id, target.id);
		await updateTarget(target.id, { enabled: false });

		const permissions = await listPermissions(token.id);
		const targets = await Promise.all(
			permissions.map(async (p) => {
				const t = await getTargetById(p.targetId);
				return t && t.enabled ? { slug: t.slug } : null;
			})
		);
		const result = targets.filter(Boolean);

		expect(result).toHaveLength(0);
	});

	it("returns empty array for token with no permissions", async () => {
		const { token } = await createTestToken();
		const permissions = await listPermissions(token.id);
		expect(permissions).toHaveLength(0);
	});
});
