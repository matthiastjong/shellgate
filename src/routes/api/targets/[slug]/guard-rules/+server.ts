import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireAdmin } from "$lib/server/api-auth";
import { getTargetBySlug } from "$lib/server/services/targets";
import { listGuardRules, createGuardRule } from "$lib/server/services/guard-rules";

export const GET: RequestHandler = async ({ request, params }) => {
	await requireAdmin(request);

	const target = await getTargetBySlug(params.slug);
	if (!target) throw error(404, "target not found");

	const rules = await listGuardRules(target.id);
	return json(rules);
};

export const POST: RequestHandler = async ({ request, params }) => {
	await requireAdmin(request);

	const target = await getTargetBySlug(params.slug);
	if (!target) throw error(404, "target not found");

	const body = await request.json().catch(() => ({}));

	if (!body.field || !body.operator || !body.value || !body.action || !body.reason) {
		throw error(400, "field, operator, value, action, and reason are required");
	}

	const validFields = ["command", "method", "path", "query"];
	const validOperators = ["contains", "equals", "starts_with"];
	const validActions = ["allow", "block", "approval_required"];

	if (!validFields.includes(body.field)) throw error(400, "invalid field");
	if (!validOperators.includes(body.operator)) throw error(400, "invalid operator");
	if (!validActions.includes(body.action)) throw error(400, "invalid action");

	try {
		const rule = await createGuardRule(target.id, {
			field: body.field,
			operator: body.operator,
			value: body.value,
			action: body.action,
			reason: body.reason,
			priority: body.priority,
		});
		return json(rule, { status: 201 });
	} catch (err) {
		if (err && typeof err === "object" && "status" in err) throw err;
		if (err instanceof Error) throw error(400, err.message);
		throw err;
	}
};
