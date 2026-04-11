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

export function generateHermesScript(baseUrl: string, token: string): string {
	return `#!/bin/bash
set -e

SHELLGATE_URL="${baseUrl}"
SHELLGATE_API_KEY="${token}"

echo "Verifying connection..."
VERIFY=$(curl -sf -H "Authorization: Bearer $SHELLGATE_API_KEY" "$SHELLGATE_URL/verify-connection" 2>&1) || {
  echo "❌ Invalid token or Shellgate unreachable"
  exit 1
}

# Add environment variables to Hermes .env
mkdir -p ~/.hermes
touch ~/.hermes/.env

if [ -f ~/.hermes/.env ]; then
  sed -i.bak '/^SHELLGATE_URL=/d;/^SHELLGATE_API_KEY=/d' ~/.hermes/.env
  rm -f ~/.hermes/.env.bak
fi

echo "SHELLGATE_URL=$SHELLGATE_URL" >> ~/.hermes/.env
echo "SHELLGATE_API_KEY=$SHELLGATE_API_KEY" >> ~/.hermes/.env

# Install skill (download template and inject hardcoded values)
mkdir -p ~/.hermes/skills/shellgate
curl -sf -H "Authorization: Bearer $SHELLGATE_API_KEY" \\
  "$SHELLGATE_URL/api/skill" | \\
  sed "s|\\$SHELLGATE_URL|$SHELLGATE_URL|g; s|\\$SHELLGATE_API_KEY|$SHELLGATE_API_KEY|g; s|Use environment variable \\\`SHELLGATE_URL\\\`|$SHELLGATE_URL|g; s|Use environment variable \\\`SHELLGATE_API_KEY\\\` as Bearer token|Bearer token (embedded in curl commands below)|g" \\
  > ~/.hermes/skills/shellgate/SKILL.md

# Restart gateway so the new skill is picked up
if command -v hermes &> /dev/null; then
  echo "Restarting Hermes gateway..."
  hermes gateway restart > /dev/null 2>&1 || true
fi

# Webhook polling setup
echo ""
read -p "Set up webhook polling? (y/N): " SETUP_WEBHOOKS < /dev/tty
if [ "\$SETUP_WEBHOOKS" = "y" ] || [ "\$SETUP_WEBHOOKS" = "Y" ]; then
  read -p "Polling interval in minutes [5]: " POLL_INTERVAL < /dev/tty
  POLL_INTERVAL=\${POLL_INTERVAL:-5}
  read -p "Telegram chat ID for notifications (leave empty to skip): " TELEGRAM_ID < /dev/tty

  DELIVER_FLAG=""
  if [ -n "\$TELEGRAM_ID" ]; then
    DELIVER_FLAG="--deliver telegram:\$TELEGRAM_ID"
  fi

  # Remove all existing shellgate-webhooks cron jobs
  if command -v jq &> /dev/null; then
    hermes cron list --json 2>/dev/null | jq -r 'if type == "array" then .[] else .jobs[]? // empty end | select(.name == "shellgate-webhooks") | .id' | while read -r JOB_ID; do
      hermes cron remove "\$JOB_ID" > /dev/null 2>&1
    done
  fi
  hermes cron create "every \${POLL_INTERVAL}m" "Poll Shellgate webhooks using your shellgate skill. If no events, respond with [SILENT] and nothing else." --name shellgate-webhooks --skill shellgate \$DELIVER_FLAG > /dev/null 2>&1 && echo "   Webhook polling: enabled (every \${POLL_INTERVAL}m)" || echo "   Webhook polling: skipped (set up manually with: hermes cron create)"
fi

PROMPT="Use the Shellgate skill to find out which targets you have access to"
WIDTH=\$(( \${#PROMPT} + 4 ))
BORDER=\$(printf '─%.0s' \$(seq 1 \$(( WIDTH - 2 ))))

echo ""
echo "🐚 Shellgate → Hermes connected"
echo ""
echo "Try it out, ask your agent:"
echo "╭\${BORDER}╮"
echo "│ \${PROMPT} │"
echo "╰\${BORDER}╯"
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

# Install skill (download template and inject hardcoded values)
mkdir -p ~/.openclaw/skills/shellgate
curl -sf -H "Authorization: Bearer $SHELLGATE_API_KEY" \\
  "$SHELLGATE_URL/api/skill" | \\
  sed "s|\\$SHELLGATE_URL|$SHELLGATE_URL|g; s|\\$SHELLGATE_API_KEY|$SHELLGATE_API_KEY|g; s|Use environment variable \\\`SHELLGATE_URL\\\`|$SHELLGATE_URL|g; s|Use environment variable \\\`SHELLGATE_API_KEY\\\` as Bearer token|Bearer token (embedded in curl commands below)|g" \\
  > ~/.openclaw/skills/shellgate/SKILL.md

# Restart gateway so the new skill is picked up
if command -v openclaw &> /dev/null; then
  echo "Restarting OpenClaw gateway..."
  openclaw gateway restart > /dev/null 2>&1 || true
fi

# Webhook polling setup
echo ""
read -p "Set up webhook polling? (y/N): " SETUP_WEBHOOKS < /dev/tty
if [ "\$SETUP_WEBHOOKS" = "y" ] || [ "\$SETUP_WEBHOOKS" = "Y" ]; then
  read -p "Polling interval in minutes [5]: " POLL_INTERVAL < /dev/tty
  POLL_INTERVAL=\${POLL_INTERVAL:-5}
  read -p "Telegram chat ID for notifications: " TELEGRAM_ID < /dev/tty

  if [ -z "\$TELEGRAM_ID" ]; then
    echo "   Webhook polling: skipped (Telegram chat ID required)"
  else
    # Remove all existing shellgate-webhooks cron jobs
    if command -v jq &> /dev/null; then
      openclaw cron list --json 2>/dev/null | jq -r 'if type == "array" then .[] else .jobs[]? // empty end | select(.name == "shellgate-webhooks") | .id' | while read -r JOB_ID; do
        openclaw cron remove "\$JOB_ID" > /dev/null 2>&1
      done
    fi
    openclaw cron add --name shellgate-webhooks --every "\${POLL_INTERVAL}m" --session isolated --light-context --announce --channel telegram --to "\$TELEGRAM_ID" --message "Poll Shellgate webhooks using your shellgate skill. If no events, respond with NO_REPLY and nothing else." > /dev/null 2>&1 && echo "   Webhook polling: enabled (every \${POLL_INTERVAL}m → Telegram)" || echo "   Webhook polling: skipped (set up manually with: openclaw cron add)"
  fi
fi

PROMPT="Use the Shellgate skill to find out which targets you have access to"
WIDTH=\$(( \${#PROMPT} + 4 ))
BORDER=\$(printf '─%.0s' \$(seq 1 \$(( WIDTH - 2 ))))

echo ""
echo "🐚 Shellgate → OpenClaw connected"
echo ""
echo "Try it out, ask your agent:"
echo "╭\${BORDER}╮"
echo "│ \${PROMPT} │"
echo "╰\${BORDER}╯"
`;
}
