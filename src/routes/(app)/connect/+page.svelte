<script lang="ts">
import { goto } from "$app/navigation";
import { page } from "$app/state";
import * as Dialog from "$lib/components/ui/dialog/index.js";
import ConnectAgentFlow from "$lib/components/connect-agent-flow.svelte";
import type { PageData } from "./$types";

let { data }: { data: PageData } = $props();
let gatewayUrl = $derived(page.url.origin);
let open = $state(true);

function handleClose() {
	open = false;
	goto("/");
}
</script>

<Dialog.Root bind:open onOpenChange={(v) => { if (!v) handleClose(); }}>
	<Dialog.Content class="sm:max-w-2xl">
		<Dialog.Header>
			<Dialog.Title>Connect Agent</Dialog.Title>
			<Dialog.Description>Set up a secure connection between your AI agent and Shellgate.</Dialog.Description>
		</Dialog.Header>
		<ConnectAgentFlow
			mode="modal"
			targets={data.targets}
			{gatewayUrl}
			actionUrl="/connect"
			onComplete={handleClose}
		/>
	</Dialog.Content>
</Dialog.Root>
