import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

function getBaseUrl(request: Request, url: URL): string {
	const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
	const host = request.headers.get("x-forwarded-host") ?? url.host;
	return `${proto}://${host}`;
}

function generateScript(baseUrl: string, token: string): string {
	return `#!/bin/bash
set -e

SHELLGATE_URL="${baseUrl}"
SHELLGATE_API_KEY="${token}"

# Verify token is valid before installing
echo "Verifying connection..."
VERIFY=$(curl -sf -H "Authorization: Bearer $SHELLGATE_API_KEY" "$SHELLGATE_URL/verify-connection" 2>&1) || {
  echo "❌ Invalid token or Shellgate unreachable"
  exit 1
}

# Configure Claude Code environment variables
mkdir -p ~/.claude
node -e "
  const fs=require('fs'),p=process.env.HOME+'/.claude/settings.json';
  const s=fs.existsSync(p)?JSON.parse(fs.readFileSync(p)):{};
  s.env={...s.env,SHELLGATE_URL:'$SHELLGATE_URL',SHELLGATE_API_KEY:'$SHELLGATE_API_KEY'};
  fs.writeFileSync(p,JSON.stringify(s,null,2));
"

# Install skill
mkdir -p ~/.claude/skills/shellgate
curl -sf -H "Authorization: Bearer $SHELLGATE_API_KEY" \\
  "$SHELLGATE_URL/api/skill" > ~/.claude/skills/shellgate/SKILL.md

echo ""
echo "✅ Shellgate connected to Claude Code"
echo "   URL: $SHELLGATE_URL"
echo "   Skill installed: ~/.claude/skills/shellgate/SKILL.md"
echo "   Env configured: ~/.claude/settings.json"
echo ""
echo "Verifying with Claude Code..."
claude "Confirm the Shellgate skill is loaded, then run: curl -s -H \\"Authorization: Bearer \\$SHELLGATE_API_KEY\\" \\$SHELLGATE_URL/verify-connection"
`;
}

export const GET: RequestHandler = async ({ params, request, url }) => {
	const token = params.token;

	if (!token?.startsWith("sg_")) {
		throw error(400, "Invalid token format");
	}

	const baseUrl = getBaseUrl(request, url);
	const script = generateScript(baseUrl, token);

	return new Response(script, {
		headers: {
			"Content-Type": "text/plain",
		},
	});
};
