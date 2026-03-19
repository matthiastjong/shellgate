<script lang="ts">
import { page } from "$app/state";
import ShieldCheckIcon from "@lucide/svelte/icons/shield-check";
import ConnectAgentFlow from "$lib/components/connect-agent-flow.svelte";
import type { PageData } from "./$types";

let { data }: { data: PageData } = $props();
let gatewayUrl = $derived(page.url.origin);
</script>

<div class="bg-background flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10">
	<div class="w-full max-w-2xl space-y-8">
		<div class="flex flex-col items-center gap-2 text-center">
			<div class="flex size-8 items-center justify-center rounded-md">
				<ShieldCheckIcon class="size-6" />
			</div>
			<h1 class="text-xl font-bold">Welcome to Shellgate</h1>
			<p class="text-muted-foreground text-sm">Let's set up your first agent connection.</p>
		</div>

		<ConnectAgentFlow
			mode="onboarding"
			targets={data.targets}
			{gatewayUrl}
			actionUrl="/onboarding"
		/>
	</div>
</div>
