export function isUniqueViolation(err: unknown): boolean {
	const check = (e: unknown): boolean => {
		if (!e || typeof e !== "object") return false;
		const obj = e as Record<string, unknown>;
		if (obj.code === "23505") return true;
		if ("cause" in obj) return check(obj.cause);
		return false;
	};
	return check(err);
}
