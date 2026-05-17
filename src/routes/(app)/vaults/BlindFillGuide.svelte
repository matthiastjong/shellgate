<script lang="ts">
	import * as Dialog from "$lib/components/ui/dialog/index.js";
	import { Button } from "$lib/components/ui/button/index.js";
	import InfoIcon from "@lucide/svelte/icons/info";
	import { page } from "$app/stores";

	let open = $state(false);

	let shellgateUrl = $derived($page.url.origin);
</script>

<Button variant="outline" size="sm" onclick={() => { open = true; }}>
	<InfoIcon class="mr-2 size-4" />
	Setup Blind-Fill
</Button>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-lg max-h-[80vh] overflow-y-auto">
		<Dialog.Header>
			<Dialog.Title>Blind-Fill Setup</Dialog.Title>
			<Dialog.Description>
				Laat je AI-agent wachtwoorden invullen in de browser zonder dat de agent het wachtwoord ziet.
			</Dialog.Description>
		</Dialog.Header>

		<div class="space-y-4 text-sm">
			<section>
				<h3 class="font-semibold mb-1">Hoe werkt het?</h3>
				<p class="text-muted-foreground">
					De agent zoekt credentials via <code>vault_search</code> en krijgt een handle terug — nooit het wachtwoord zelf.
					Een lokaal MCP-script haalt het wachtwoord op bij Shellgate en vult het direct in de browser via Chrome DevTools Protocol.
				</p>
			</section>

			<section>
				<h3 class="font-semibold mb-1">1. Download het script</h3>
				<pre class="bg-muted rounded-md p-3 text-xs overflow-x-auto"><code>curl -o ~/.shellgate/blind-fill.mjs \
  {shellgateUrl}/api/local-mcp/blind-fill</code></pre>
			</section>

			<section>
				<h3 class="font-semibold mb-1">2. Configureer als MCP server</h3>
				<p class="text-muted-foreground mb-2">Voeg dit toe aan je MCP config:</p>
				<pre class="bg-muted rounded-md p-3 text-xs overflow-x-auto"><code>{JSON.stringify({
	"shellgate-secrets": {
		command: "node",
		args: ["~/.shellgate/blind-fill.mjs"],
		env: {
			SHELLGATE_URL: shellgateUrl,
			SHELLGATE_TOKEN: "sg_...",
			CDP_URL: "http://localhost:9222",
		},
	},
}, null, 2)}</code></pre>
			</section>

			<section>
				<h3 class="font-semibold mb-1">3. Start Chrome met debugging</h3>
				<p class="text-muted-foreground mb-2">Chrome moet gestart zijn met remote debugging:</p>
				<pre class="bg-muted rounded-md p-3 text-xs overflow-x-auto"><code>google-chrome --remote-debugging-port=9222</code></pre>
				<p class="text-muted-foreground text-xs mt-1">
					Als je Bighead of OpenClaw gebruikt, wordt dit automatisch gedaan.
				</p>
			</section>

			<section>
				<h3 class="font-semibold mb-1">Voorbeeld</h3>
				<p class="text-muted-foreground">
					Vraag je agent: <em>"Zoek mijn GitHub credentials en vul het wachtwoord in op de login pagina"</em>.
					De agent gebruikt <code>vault_search</code> om de handle te vinden, en <code>blind_fill</code> om het wachtwoord in te vullen.
				</p>
			</section>
		</div>

		<Dialog.Footer>
			<Button variant="outline" onclick={() => { open = false; }}>Sluiten</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
