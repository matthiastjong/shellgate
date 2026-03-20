export function generateClaudeCodeScript(baseUrl: string, token: string): string {
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
claude "Confirm the shellgate skill is loaded, then run: curl -s -H \\"Authorization: Bearer \\$SHELLGATE_API_KEY\\" \\$SHELLGATE_URL/verify-connection"
`;
}

export function generateOpenClawScript(baseUrl: string, token: string): string {
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

PROMPT="Use the Shellgate skill to find out which targets you have access to"
WIDTH=\$(( \${#PROMPT} + 4 ))
BORDER=\$(printf '─%.0s' \$(seq 1 \$(( WIDTH - 2 ))))

echo ""
echo "🐚 Shellgate → OpenClaw connected"
echo ""
echo "Try it out:"
echo "╭\${BORDER}╮"
echo "│ \${PROMPT} │"
echo "╰\${BORDER}╯"
`;
}
