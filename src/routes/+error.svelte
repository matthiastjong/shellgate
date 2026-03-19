<script lang="ts">
import { page } from "$app/state";
import ShieldCheckIcon from "@lucide/svelte/icons/shield-check";
</script>

<div class="bg-background flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10">
	<div class="w-full max-w-md space-y-6 text-center">
		<div class="flex flex-col items-center gap-4">
			<div class="flex size-12 items-center justify-center rounded-full bg-destructive/10">
				<ShieldCheckIcon class="size-6 text-destructive" />
			</div>
			<div class="space-y-2">
				<h1 class="text-4xl font-bold tracking-tight">{page.status}</h1>
				<p class="text-muted-foreground text-lg">{page.error?.message ?? "Something went wrong"}</p>
			</div>
		</div>

		<a
			href="/"
			class="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 transition-colors"
		>
			Go to Dashboard
		</a>
	</div>
</div>
