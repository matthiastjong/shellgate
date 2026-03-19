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

# Add environment variables to global OpenClaw .env
mkdir -p ~/.openclaw
touch ~/.openclaw/.env

# Remove any existing SHELLGATE_ entries to avoid duplicates
if [ -f ~/.openclaw/.env ]; then
  sed -i.bak '/^SHELLGATE_URL=/d;/^SHELLGATE_API_KEY=/d' ~/.openclaw/.env
  rm -f ~/.openclaw/.env.bak
fi

echo "SHELLGATE_URL=$SHELLGATE_URL" >> ~/.openclaw/.env
echo "SHELLGATE_API_KEY=$SHELLGATE_API_KEY" >> ~/.openclaw/.env

# Install skill
mkdir -p ~/.openclaw/skills/shellgate
curl -sf -H "Authorization: Bearer $SHELLGATE_API_KEY" \\
  "$SHELLGATE_URL/api/skill" > ~/.openclaw/skills/shellgate/SKILL.md

# Restart gateway so the new skill is picked up
if command -v openclaw &> /dev/null; then
  echo "Restarting OpenClaw gateway..."
  openclaw gateway restart 2>/dev/null || true
fi

echo ""
echo "✅ Shellgate connected to OpenClaw"
echo "   URL: $SHELLGATE_URL"
echo "   Env configured: ~/.openclaw/.env"
echo "   Skill installed: ~/.openclaw/skills/shellgate/SKILL.md"
echo ""
echo "Ask your OpenClaw agent to tell you what Shellgate endpoints are available."
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
