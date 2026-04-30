export function generateClaudeCodeScript(baseUrl: string, token: string): string {
	return `#!/bin/bash
set -e

SHELLGATE_URL="${baseUrl}"
SHELLGATE_API_KEY="${token}"

# Validate API key format
if [[ "$SHELLGATE_API_KEY" != sg_* ]]; then
  echo "Invalid API key: must start with sg_"
  exit 1
fi

# Verify connection first
echo "Verifying connection..."
if ! curl -sf -H "Authorization: Bearer $SHELLGATE_API_KEY" "$SHELLGATE_URL/verify-connection" > /dev/null 2>&1; then
  echo "Warning: Could not verify connection to Shellgate at $SHELLGATE_URL"
  echo "Continuing with setup — verify your Shellgate instance is running."
fi

# Clean up old skill-based config
if [ -d ~/.claude/skills/shellgate ]; then
  rm -rf ~/.claude/skills/shellgate
  echo "Removed old skill directory"
fi

# Remove old env vars and hooks from settings.json
if [ -f ~/.claude/settings.json ]; then
  node -e '
const fs = require("fs");
const p = require("os").homedir() + "/.claude/settings.json";
const s = JSON.parse(fs.readFileSync(p, "utf8"));

// Remove old env vars
if (s.env) {
  delete s.env.SHELLGATE_URL;
  delete s.env.SHELLGATE_API_KEY;
  if (Object.keys(s.env).length === 0) delete s.env;
}

// Remove old SessionStart hooks referencing /api/skill
if (s.hooks && s.hooks.SessionStart) {
  s.hooks.SessionStart = s.hooks.SessionStart.filter(h => {
    if (h.command && h.command.includes("/api/skill")) return false;
    if (h.hooks && h.hooks.some(hook => hook.command && hook.command.includes("/api/skill"))) return false;
    return true;
  });
  if (s.hooks.SessionStart.length === 0) delete s.hooks.SessionStart;
  if (Object.keys(s.hooks).length === 0) delete s.hooks;
}

// Remove old mcpServers.shellgate if present
if (s.mcpServers) {
  delete s.mcpServers.shellgate;
  if (Object.keys(s.mcpServers).length === 0) delete s.mcpServers;
}

fs.writeFileSync(p, JSON.stringify(s, null, 2));
'
  echo "Cleaned up old config"
fi

# Register MCP server via Claude CLI
claude mcp remove shellgate 2>/dev/null || true
claude mcp add --transport http shellgate "$SHELLGATE_URL/mcp" \\
  --header "Authorization: Bearer $SHELLGATE_API_KEY"

echo ""
echo "Shellgate MCP server registered in Claude Code"
echo "   URL: $SHELLGATE_URL/mcp"
echo ""
echo "Restart Claude Code to connect to the Shellgate MCP server."
`;
}

export function generateHermesScript(baseUrl: string, token: string): string {
	return `#!/bin/bash
set -e

export SHELLGATE_URL="${baseUrl}"
export SHELLGATE_API_KEY="${token}"

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

export SHELLGATE_URL="${baseUrl}"
export SHELLGATE_API_KEY="${token}"

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
