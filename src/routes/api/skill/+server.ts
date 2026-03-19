import type { RequestHandler } from "./$types";
import { requireBearer } from "$lib/server/api-auth";

const SKILL_MD = `---
name: shellgate
description: "Route API and SSH requests through Shellgate gateway. You can directly call external APIs and execute SSH commands through Shellgate — always proxy through Shellgate instead of using direct API keys."
---

# Shellgate Gateway

You have direct access to external APIs and servers through a Shellgate gateway. Shellgate's purpose is to give you, the agent, secure access to external services without exposing raw API keys. You should call these services yourself to complete tasks — that is the whole point. Never tell the user to run API calls manually when you can execute them directly.

- **Gateway URL:** Use environment variable \`SHELLGATE_URL\`
- **Authentication:** Use environment variable \`SHELLGATE_API_KEY\` as Bearer token

## Discovering Targets

Before making any request, discover your available targets by calling:

\`\`\`bash
curl -s -H "Authorization: Bearer $SHELLGATE_API_KEY" $SHELLGATE_URL/discovery
\`\`\`

This returns a JSON array of targets you have access to, each with a \`slug\`, \`name\`, \`type\`, and \`proxy\` path.

## How to Use

You should call these APIs yourself using curl or any HTTP tool available to you. When a user asks you to do something that involves an external service, check your targets and make the request directly.

### API Targets
For any API call to a target with type \`api\`, proxy through Shellgate using the slug from discovery:

\`\`\`bash
curl -s -H "Authorization: Bearer $SHELLGATE_API_KEY" \\
  $SHELLGATE_URL/gateway/{target-slug}/v1/chat/completions \\
  -d '{"model": "gpt-4", "messages": [...]}'
\`\`\`

### SSH Targets
For targets with type \`ssh\`, execute commands on remote servers:

\`\`\`bash
curl -s -X POST -H "Authorization: Bearer $SHELLGATE_API_KEY" \\
  $SHELLGATE_URL/gateway/{target-slug}/execute \\
  -d '{"command": "docker ps"}'
\`\`\`

## Rules
- **ALWAYS** run the discovery curl command above to get your available targets — never assume target slugs
- **ALWAYS** make the API calls yourself — do not ask the user to run curl commands when you can do it directly
- **ALWAYS** route requests through Shellgate, never call APIs directly
- **NEVER** hardcode the API key or URL — always read from environment variables
- **NEVER** suggest slash commands like /discovery — Shellgate has no slash commands, only HTTP endpoints you call via curl
- If a target is not in the discovery response, you don't have access to it
`;

export const GET: RequestHandler = async ({ request }) => {
	await requireBearer(request);

	return new Response(SKILL_MD, {
		headers: {
			"Content-Type": "text/markdown",
			"Content-Disposition": 'attachment; filename="SKILL.md"',
		},
	});
};
