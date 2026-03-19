import { beforeEach, describe, expect, it } from "vitest";
import { listPermissions } from "$lib/server/services/permissions";
import { requireBearer } from "$lib/server/api-auth";
import { generateClaudeCodeScript, generateOpenClawScript } from "$lib/server/utils/install-scripts";
import {
	createTestToken,
	createTestTarget,
	grantPermission,
	truncateAll,
} from "../helpers";

describe("bearer auth for skill/verify endpoints", () => {
	beforeEach(async () => {
		await truncateAll();
	});

	it("accepts valid sg_ token", async () => {
		const { token, plainToken } = await createTestToken("Test Agent");
		const req = new Request("http://localhost/api/skill", {
			headers: { Authorization: `Bearer ${plainToken}` },
		});
		const result = await requireBearer(req);
		expect(result.id).toBe(token.id);
		expect(result.name).toBe("Test Agent");
	});

	it("rejects missing Authorization header", async () => {
		const req = new Request("http://localhost/api/skill");
		await expect(requireBearer(req)).rejects.toThrow();
	});

	it("rejects invalid token", async () => {
		const req = new Request("http://localhost/api/skill", {
			headers: { Authorization: "Bearer sg_nonexistent" },
		});
		await expect(requireBearer(req)).rejects.toThrow();
	});
});

describe("verify-connection logic", () => {
	beforeEach(async () => {
		await truncateAll();
	});

	it("token with permissions has correct target count", async () => {
		const { token } = await createTestToken();
		const t1 = await createTestTarget("API 1", "https://api1.com");
		const t2 = await createTestTarget("API 2", "https://api2.com");
		await grantPermission(token.id, t1.id);
		await grantPermission(token.id, t2.id);
		const permissions = await listPermissions(token.id);
		expect(permissions).toHaveLength(2);
	});

	it("token without permissions has 0 targets", async () => {
		const { token } = await createTestToken();
		const permissions = await listPermissions(token.id);
		expect(permissions).toHaveLength(0);
	});
});

describe("install script generation", () => {
	const BASE = "https://shellgate.example.com";
	const TOKEN = "sg_test1234567890abcdef";

	describe("claude-code", () => {
		it("produces valid bash script with correct vars", () => {
			const script = generateClaudeCodeScript(BASE, TOKEN);
			expect(script).toContain("#!/bin/bash");
			expect(script).toContain(`SHELLGATE_URL="${BASE}"`);
			expect(script).toContain(`SHELLGATE_API_KEY="${TOKEN}"`);
		});

		it("configures claude settings.json", () => {
			const script = generateClaudeCodeScript(BASE, TOKEN);
			expect(script).toContain(".claude/settings.json");
			expect(script).toContain("SHELLGATE_URL");
			expect(script).toContain("SHELLGATE_API_KEY");
		});

		it("installs skill file", () => {
			const script = generateClaudeCodeScript(BASE, TOKEN);
			expect(script).toContain(".claude/skills/shellgate/SKILL.md");
			expect(script).toContain("/api/skill");
		});

		it("verifies connection before installing", () => {
			const script = generateClaudeCodeScript(BASE, TOKEN);
			const verifyIdx = script.indexOf("/verify-connection");
			const skillIdx = script.indexOf("/api/skill");
			expect(verifyIdx).toBeGreaterThan(-1);
			expect(skillIdx).toBeGreaterThan(-1);
			expect(verifyIdx).toBeLessThan(skillIdx);
		});

		it("invokes claude CLI for verification", () => {
			const script = generateClaudeCodeScript(BASE, TOKEN);
			expect(script).toContain('claude "');
		});

		it("exits on failed verification", () => {
			const script = generateClaudeCodeScript(BASE, TOKEN);
			expect(script).toContain("exit 1");
		});
	});

	describe("openclaw", () => {
		it("produces valid bash script with correct vars", () => {
			const script = generateOpenClawScript(BASE, TOKEN);
			expect(script).toContain("#!/bin/bash");
			expect(script).toContain(`SHELLGATE_URL="${BASE}"`);
			expect(script).toContain(`SHELLGATE_API_KEY="${TOKEN}"`);
		});

		it("configures openclaw .env with deduplication", () => {
			const script = generateOpenClawScript(BASE, TOKEN);
			expect(script).toContain(".openclaw/.env");
			expect(script).toContain("sed");
			expect(script).toContain("SHELLGATE_URL");
			expect(script).toContain("SHELLGATE_API_KEY");
		});

		it("installs skill file", () => {
			const script = generateOpenClawScript(BASE, TOKEN);
			expect(script).toContain(".openclaw/skills/shellgate/SKILL.md");
		});

		it("restarts openclaw gateway", () => {
			const script = generateOpenClawScript(BASE, TOKEN);
			expect(script).toContain("openclaw gateway restart");
		});

		it("verifies connection before installing", () => {
			const script = generateOpenClawScript(BASE, TOKEN);
			const verifyIdx = script.indexOf("/verify-connection");
			const skillIdx = script.indexOf("/api/skill");
			expect(verifyIdx).toBeLessThan(skillIdx);
		});
	});
});
