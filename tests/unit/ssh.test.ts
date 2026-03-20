import { describe, expect, it } from "vitest";
import { executeCommand } from "$lib/server/services/ssh";

describe("SSH executeCommand validation", () => {
	it("rejects empty command", async () => {
		await expect(
			executeCommand({ host: "localhost", port: 22, username: "root" }, "key", ""),
		).rejects.toThrow("command is required");
	});

	it("rejects whitespace-only command", async () => {
		await expect(
			executeCommand({ host: "localhost", port: 22, username: "root" }, "key", "   "),
		).rejects.toThrow("command is required");
	});
});
