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
claude mcp remove shellgate --scope user 2>/dev/null || true
claude mcp remove shellgate --scope local 2>/dev/null || true
claude mcp remove shellgate --scope project 2>/dev/null || true
claude mcp add --transport http --scope user shellgate "$SHELLGATE_URL/mcp" \\
  --header "Authorization: Bearer $SHELLGATE_API_KEY"

# Create discovery helper scripts
mkdir -p ~/.claude/shellgate

cat > ~/.claude/shellgate/format.js << 'JSEOF'
const d=JSON.parse(require("fs").readFileSync(0,"utf8"));
const t=d.targets||[], s=d.skills||[], w=d.webhooks||[], m=d.memories||[], wp=d.wiki_pages||[];
const lines=[];
if(d.policy) lines.push(d.policy);
lines.push("Shellgate context:");
if(t.length) lines.push("Targets: "+t.map(x=>x.slug+" ("+x.type+")").join(", "));
if(s.length) lines.push("Org skills (fetch via org_skill_read MCP tool, NOT via Skill tool): "+s.map(x=>x.slug+" - "+(x.description||"")).join("; "));
if(w.length) lines.push("Webhooks: "+w.map(x=>x.name).join(", "));
if(m.length) lines.push("Memories: "+m.length+" entries (scan summaries via memory_list, call memory_read for relevant ones)");
if(wp.length) lines.push("Wiki: "+wp.length+" pages available (call wiki_read_page on demand)");
lines.push("IMPORTANT: Org skills are NOT local skills. Do NOT use the Skill tool for them. Use the shellgate org_skill_read MCP tool to load org skills, and shellgate api_request for external API calls.");
process.stdout.write(lines.join("\\n")+"\\n");
JSEOF

cat > ~/.claude/shellgate/discover.sh << 'SHEOF'
#!/bin/bash
curl -sf -H "Authorization: Bearer $SHELLGATE_API_KEY" "$SHELLGATE_URL/bootstrap" 2>/dev/null \
  | node ~/.claude/shellgate/format.js 2>/dev/null \
  || echo "Shellgate: could not fetch context (server may be offline)"
SHEOF
chmod +x ~/.claude/shellgate/discover.sh

# Add SessionStart hook and env vars to settings.json
export SHELLGATE_URL SHELLGATE_API_KEY
node << SETTINGSEOF
const fs = require("fs");
const p = require("os").homedir() + "/.claude/settings.json";
const s = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : {};

if (!s.env) s.env = {};
s.env.SHELLGATE_URL = process.env.SHELLGATE_URL;
s.env.SHELLGATE_API_KEY = process.env.SHELLGATE_API_KEY;

if (!s.hooks) s.hooks = {};
if (!s.hooks.SessionStart) s.hooks.SessionStart = [];

s.hooks.SessionStart = s.hooks.SessionStart.filter(h => {
  if (h.hooks && h.hooks.some(hook => hook.command && hook.command.includes("shellgate"))) return false;
  return true;
});

s.hooks.SessionStart.push({
  matcher: "*",
  hooks: [{
    type: "command",
    command: "bash ~/.claude/shellgate/discover.sh",
    statusMessage: "Loading Shellgate context..."
  }]
});

fs.writeFileSync(p, JSON.stringify(s, null, 2));
SETTINGSEOF

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

SHELLGATE_URL="${baseUrl}"
SHELLGATE_API_KEY="${token}"

# Validate API key format
if [[ "$SHELLGATE_API_KEY" != sg_* ]]; then
  echo "Invalid API key: must start with sg_"
  exit 1
fi

# Verify connection
echo "Verifying connection..."
if ! curl -sf -H "Authorization: Bearer $SHELLGATE_API_KEY" "$SHELLGATE_URL/verify-connection" > /dev/null 2>&1; then
  echo "Warning: Could not verify connection to Shellgate at $SHELLGATE_URL"
  echo "Continuing with setup — verify your Shellgate instance is running."
fi

# Clean up old skill-based config
if [ -d ~/.hermes/skills/shellgate ]; then
  rm -rf ~/.hermes/skills/shellgate
  echo "Removed old skill directory"
fi

# Register MCP server
if command -v hermes &> /dev/null; then
  hermes mcp remove shellgate 2>/dev/null || true
  hermes mcp add shellgate "$SHELLGATE_URL/mcp" \\
    --transport http \\
    --header "Authorization: Bearer $SHELLGATE_API_KEY"
  echo "MCP server registered"
else
  echo "Warning: hermes CLI not found. Add MCP server manually."
fi

# Create discovery helper scripts
mkdir -p ~/.hermes/shellgate

cat > ~/.hermes/shellgate/format.js << 'JSEOF'
const d=JSON.parse(require("fs").readFileSync(0,"utf8"));
const t=d.targets||[], s=d.skills||[], w=d.webhooks||[], m=d.memories||[], wp=d.wiki_pages||[];
const lines=[];
if(d.policy) lines.push(d.policy);
lines.push("Shellgate context:");
if(t.length) lines.push("Targets: "+t.map(x=>x.slug+" ("+x.type+")").join(", "));
if(s.length) lines.push("Org skills (fetch via org_skill_read MCP tool, NOT via Skill tool): "+s.map(x=>x.slug+" - "+(x.description||"")).join("; "));
if(w.length) lines.push("Webhooks: "+w.map(x=>x.name).join(", "));
if(m.length) lines.push("Memories: "+m.length+" entries (scan summaries via memory_list, call memory_read for relevant ones)");
if(wp.length) lines.push("Wiki: "+wp.length+" pages available (call wiki_read_page on demand)");
lines.push("IMPORTANT: Org skills are NOT local skills. Use the shellgate org_skill_read MCP tool to load them.");
process.stdout.write(lines.join("\\n")+"\\n");
JSEOF

cat > ~/.hermes/shellgate/discover.sh << 'SHEOF'
#!/bin/bash
curl -sf -H "Authorization: Bearer $SHELLGATE_API_KEY" "$SHELLGATE_URL/bootstrap" 2>/dev/null \\
  | node ~/.hermes/shellgate/format.js 2>/dev/null \\
  || echo "Shellgate: could not fetch context (server may be offline)"
SHEOF
chmod +x ~/.hermes/shellgate/discover.sh

# Add env vars to .env
mkdir -p ~/.hermes
touch ~/.hermes/.env
if [ -f ~/.hermes/.env ]; then
  sed -i.bak '/^SHELLGATE_URL=/d;/^SHELLGATE_API_KEY=/d' ~/.hermes/.env
  rm -f ~/.hermes/.env.bak
fi
echo "SHELLGATE_URL=$SHELLGATE_URL" >> ~/.hermes/.env
echo "SHELLGATE_API_KEY=$SHELLGATE_API_KEY" >> ~/.hermes/.env

# Add on_session_start hook to cli-config.yaml
if [ -f ~/.hermes/cli-config.yaml ]; then
  # Remove existing shellgate hook block if present
  sed -i.bak '/# shellgate-hook-start/,/# shellgate-hook-end/d' ~/.hermes/cli-config.yaml
  rm -f ~/.hermes/cli-config.yaml.bak
fi
cat >> ~/.hermes/cli-config.yaml << 'HOOKEOF'
# shellgate-hook-start
hooks:
  on_session_start:
    - command: "bash ~/.hermes/shellgate/discover.sh"
# shellgate-hook-end
HOOKEOF

echo ""
echo "Shellgate → Hermes connected (MCP)"
echo "   URL: $SHELLGATE_URL/mcp"
echo ""
echo "Restart Hermes to connect to the Shellgate MCP server."
`;
}

export function generateOpenClawScript(baseUrl: string, token: string): string {
	return `#!/bin/bash
set -e

SHELLGATE_URL="${baseUrl}"
SHELLGATE_API_KEY="${token}"

# Validate API key format
if [[ "$SHELLGATE_API_KEY" != sg_* ]]; then
  echo "Invalid API key: must start with sg_"
  exit 1
fi

# Verify connection
echo "Verifying connection..."
if ! curl -sf -H "Authorization: Bearer $SHELLGATE_API_KEY" "$SHELLGATE_URL/verify-connection" > /dev/null 2>&1; then
  echo "Warning: Could not verify connection to Shellgate at $SHELLGATE_URL"
  echo "Continuing with setup — verify your Shellgate instance is running."
fi

# Clean up old skill-based config
if [ -d ~/.openclaw/skills/shellgate ]; then
  rm -rf ~/.openclaw/skills/shellgate
  echo "Removed old skill directory"
fi

# Add MCP server to openclaw.json
CONFIG_PATH="\${OPENCLAW_CONFIG_PATH:-\$HOME/.openclaw/openclaw.json}"
mkdir -p "\$(dirname "\$CONFIG_PATH")"

if [ -f "\$CONFIG_PATH" ]; then
  node -e '
const fs = require("fs");
const p = process.argv[1];
const s = JSON.parse(fs.readFileSync(p, "utf8"));
if (!s.mcp) s.mcp = {};
if (!s.mcp.servers) s.mcp.servers = {};
s.mcp.servers.shellgate = {
  url: process.env.SHELLGATE_URL + "/mcp",
  transport: "http",
  headers: { "Authorization": "Bearer " + process.env.SHELLGATE_API_KEY }
};
fs.writeFileSync(p, JSON.stringify(s, null, 2));
' "\$CONFIG_PATH"
else
  cat > "\$CONFIG_PATH" << JSONEOF
{
  "mcp": {
    "servers": {
      "shellgate": {
        "url": "\$SHELLGATE_URL/mcp",
        "transport": "http",
        "headers": {
          "Authorization": "Bearer \$SHELLGATE_API_KEY"
        }
      }
    }
  }
}
JSONEOF
fi
echo "MCP server added to \$CONFIG_PATH"

# Add env vars
mkdir -p ~/.openclaw
touch ~/.openclaw/.env
if [ -f ~/.openclaw/.env ]; then
  sed -i.bak '/^SHELLGATE_URL=/d;/^SHELLGATE_API_KEY=/d' ~/.openclaw/.env
  rm -f ~/.openclaw/.env.bak
fi
echo "SHELLGATE_URL=\$SHELLGATE_URL" >> ~/.openclaw/.env
echo "SHELLGATE_API_KEY=\$SHELLGATE_API_KEY" >> ~/.openclaw/.env

echo ""
echo "Shellgate → OpenClaw connected (MCP)"
echo "   URL: \$SHELLGATE_URL/mcp"
echo ""
echo "Note: OpenClaw does not yet support SessionStart hooks."
echo "The agent will discover Shellgate via MCP instructions."
echo "Call 'bootstrap' as the first Shellgate tool in each session."
echo ""
echo "Restart OpenClaw to connect to the Shellgate MCP server."
`;
}

export function generateCodexScript(baseUrl: string, token: string): string {
	return `#!/bin/bash
set -e

SHELLGATE_URL="${baseUrl}"
SHELLGATE_API_KEY="${token}"

# Validate API key format
if [[ "$SHELLGATE_API_KEY" != sg_* ]]; then
  echo "Invalid API key: must start with sg_"
  exit 1
fi

# Verify connection
echo "Verifying connection..."
if ! curl -sf -H "Authorization: Bearer $SHELLGATE_API_KEY" "$SHELLGATE_URL/verify-connection" > /dev/null 2>&1; then
  echo "Warning: Could not verify connection to Shellgate at $SHELLGATE_URL"
  echo "Continuing with setup — verify your Shellgate instance is running."
fi

# Register MCP server via Codex CLI
if command -v codex &> /dev/null; then
  codex mcp remove shellgate 2>/dev/null || true
  codex mcp add shellgate \\
    --transport http \\
    --url "$SHELLGATE_URL/mcp" \\
    --header "Authorization: Bearer $SHELLGATE_API_KEY"
  echo "MCP server registered"
else
  echo "Warning: codex CLI not found. Add MCP server manually to ~/.codex/config.toml"
fi

# Create discovery helper scripts
mkdir -p ~/.codex/shellgate

cat > ~/.codex/shellgate/format.js << 'JSEOF'
const d=JSON.parse(require("fs").readFileSync(0,"utf8"));
const t=d.targets||[], s=d.skills||[], w=d.webhooks||[], m=d.memories||[], wp=d.wiki_pages||[];
const lines=[];
if(d.policy) lines.push(d.policy);
lines.push("Shellgate context:");
if(t.length) lines.push("Targets: "+t.map(x=>x.slug+" ("+x.type+")").join(", "));
if(s.length) lines.push("Org skills (fetch via org_skill_read MCP tool): "+s.map(x=>x.slug+" - "+(x.description||"")).join("; "));
if(w.length) lines.push("Webhooks: "+w.map(x=>x.name).join(", "));
if(m.length) lines.push("Memories: "+m.length+" entries (scan summaries via memory_list, call memory_read for relevant ones)");
if(wp.length) lines.push("Wiki: "+wp.length+" pages available (call wiki_read_page on demand)");
lines.push("IMPORTANT: Org skills are shared organization skills. Use the shellgate org_skill_read MCP tool to load them.");
process.stdout.write(lines.join("\\n")+"\\n");
JSEOF

cat > ~/.codex/shellgate/discover.sh << 'SHEOF'
#!/bin/bash
curl -sf -H "Authorization: Bearer $SHELLGATE_API_KEY" "$SHELLGATE_URL/bootstrap" 2>/dev/null \\
  | node ~/.codex/shellgate/format.js 2>/dev/null \\
  || echo "Shellgate: could not fetch context (server may be offline)"
SHEOF
chmod +x ~/.codex/shellgate/discover.sh

# Add env vars
CODEX_HOME="\${CODEX_HOME:-\$HOME/.codex}"
mkdir -p "\$CODEX_HOME"

if [ -f "\$CODEX_HOME/.env" ]; then
  sed -i.bak '/^SHELLGATE_URL=/d;/^SHELLGATE_API_KEY=/d' "\$CODEX_HOME/.env"
  rm -f "\$CODEX_HOME/.env.bak"
fi
echo "SHELLGATE_URL=\$SHELLGATE_URL" >> "\$CODEX_HOME/.env"
echo "SHELLGATE_API_KEY=\$SHELLGATE_API_KEY" >> "\$CODEX_HOME/.env"

# Add SessionStart hook
HOOKS_FILE="\$CODEX_HOME/hooks.json"
node -e '
const fs = require("fs");
const p = process.argv[1];
let hooks = [];
if (fs.existsSync(p)) {
  try { hooks = JSON.parse(fs.readFileSync(p, "utf8")); } catch {}
  if (!Array.isArray(hooks)) hooks = hooks.hooks || [];
}
hooks = hooks.filter(h => !h.command || !h.command.includes("shellgate"));
hooks.push({
  event: "SessionStart",
  matcher: "startup|resume",
  command: "bash ~/.codex/shellgate/discover.sh",
  statusMessage: "Loading Shellgate context..."
});
fs.writeFileSync(p, JSON.stringify(hooks, null, 2));
' "\$HOOKS_FILE"

echo ""
echo "Shellgate MCP server registered in Codex CLI"
echo "   URL: \$SHELLGATE_URL/mcp"
echo ""
echo "Restart Codex CLI to connect to the Shellgate MCP server."
`;
}
