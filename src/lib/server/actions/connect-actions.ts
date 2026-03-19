import { fail } from "@sveltejs/kit";
import { createToken } from "$lib/server/services/tokens";
import { listTargets, createTarget, getTargetBySlug } from "$lib/server/services/targets";
import { addPermission } from "$lib/server/services/permissions";
import { createAuthMethod } from "$lib/server/services/auth-methods";

export async function handleCreateTarget(request: Request) {
	const data = await request.formData();
	const name = data.get("name")?.toString()?.trim() ?? "";
	const base_url = data.get("base_url")?.toString()?.trim() ?? "";
	if (!name) return fail(400, { error: "Name is required" });
	if (!base_url) return fail(400, { error: "Base URL is required" });

	try {
		const target = await createTarget({ name, type: "api", base_url });
		return { created: { ...target, enabled: target.enabled !== false } };
	} catch (err) {
		return fail(400, { error: err instanceof Error ? err.message : "Failed to create target" });
	}
}

export async function handleAddAuthMethod(request: Request) {
	const data = await request.formData();
	const slug = data.get("slug")?.toString() ?? "";
	const label = data.get("label")?.toString()?.trim() ?? "";
	const credential = data.get("credential")?.toString() ?? "";
	const isDefault = data.get("isDefault") === "on";
	if (!label) return fail(400, { error: "Label is required" });
	if (!credential) return fail(400, { error: "Credential is required" });

	const target = await getTargetBySlug(slug);
	if (!target) return fail(404, { error: "Target not found" });

	try {
		const authMethod = await createAuthMethod(target.id, { label, type: "bearer", credential, isDefault });
		return { authMethodAdded: authMethod };
	} catch (err) {
		return fail(400, { error: err instanceof Error ? err.message : "Failed to add credential" });
	}
}

export async function handleCreateKey(request: Request) {
	const data = await request.formData();
	const name = data.get("name")?.toString()?.trim() ?? "";
	const targetIds = data.get("targetIds")?.toString()?.trim() ?? "";
	if (!name) return fail(400, { error: "Name is required" });

	const result = await createToken(name);
	const failedPermissions: string[] = [];

	if (targetIds) {
		for (const id of targetIds.split(",").filter(Boolean)) {
			try {
				await addPermission(result.token.id, id);
			} catch {
				failedPermissions.push(id);
			}
		}
	}

	return {
		created: {
			id: result.token.id,
			name: result.token.name,
			plainToken: result.plainToken,
		},
		...(failedPermissions.length > 0 && {
			warning: `Failed to assign ${failedPermissions.length} target(s). Check permissions manually.`,
		}),
	};
}

export async function loadTargets() {
	return await listTargets();
}
