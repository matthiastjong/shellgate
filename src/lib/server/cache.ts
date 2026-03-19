let hasTokens: boolean | null = null;
let lastTokenCheck = 0;
const TOKEN_CHECK_TTL_MS = 60_000;

export async function checkHasTokens(): Promise<boolean> {
	const now = Date.now();
	if (hasTokens === true && now - lastTokenCheck < TOKEN_CHECK_TTL_MS) return true;
	const { listTokens } = await import("./services/tokens");
	const tokens = await listTokens();
	hasTokens = tokens.length > 0;
	lastTokenCheck = now;
	return hasTokens;
}

export function resetHasTokensCache() {
	hasTokens = null;
	lastTokenCheck = 0;
}
