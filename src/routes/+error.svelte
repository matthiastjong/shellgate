<script lang="ts">
	import { page } from "$app/state";
	import { Button } from "$lib/components/ui/button/index.js";
	import ShieldCheckIcon from "@lucide/svelte/icons/shield-check";
</script>

<div class="flex min-h-[80vh] items-center justify-center p-6">
	<div class="flex max-w-md flex-col items-center gap-6">
		<div class="flex flex-col items-center gap-4 text-center">
			<div
				class="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10"
			>
				<ShieldCheckIcon class="h-6 w-6 text-destructive" />
			</div>
			<div>
				<h1 class="text-4xl font-bold tracking-tight">
					{page.status}
				</h1>
				<p class="mt-1 text-lg text-muted-foreground">
					{page.error?.message}
				</p>
			</div>
		</div>

		{#if page.error?.message?.includes("SESSION_SECRET")}
			<div class="w-full text-left">
				<p class="mb-3 text-sm text-muted-foreground">
					Add a <code
						class="rounded bg-muted px-1.5 py-0.5 text-xs font-mono"
						>SESSION_SECRET</code
					>
					to your environment variables, then restart the app.
				</p>
			</div>
		{/if}

		<Button href="/" class="w-full">Go to Dashboard</Button>
	</div>
</div>
