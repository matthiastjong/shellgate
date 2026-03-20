<script lang="ts">
	import { enhance } from "$app/forms";
	import * as Breadcrumb from "$lib/components/ui/breadcrumb/index.js";
	import * as Card from "$lib/components/ui/card/index.js";
	import * as Dialog from "$lib/components/ui/dialog/index.js";
	import { Button } from "$lib/components/ui/button/index.js";
	import { Input } from "$lib/components/ui/input/index.js";
	import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";

	let confirmText = $state("");
	let dialogOpen = $state(false);
	let submitting = $state(false);
</script>

<div class="flex flex-col gap-6">
	<div>
		<Breadcrumb.Root>
			<Breadcrumb.List>
				<Breadcrumb.Item>
					<Breadcrumb.Link href="/">Shellgate</Breadcrumb.Link>
				</Breadcrumb.Item>
				<Breadcrumb.Separator />
				<Breadcrumb.Item>
					<Breadcrumb.Page>Settings</Breadcrumb.Page>
				</Breadcrumb.Item>
			</Breadcrumb.List>
		</Breadcrumb.Root>
		<h1 class="mt-1 text-2xl font-bold tracking-tight">Settings</h1>
	</div>

	<Card.Root class="border-destructive/30">
		<Card.Header>
			<Card.Title class="flex items-center gap-2 text-destructive">
				<TriangleAlertIcon class="size-5" />
				Danger Zone
			</Card.Title>
			<Card.Description>
				Irreversible actions that affect your entire Shellgate instance.
			</Card.Description>
		</Card.Header>
		<Card.Content>
			<div class="flex items-center justify-between rounded-lg border border-destructive/20 p-4">
				<div>
					<p class="font-medium">Reset Database</p>
					<p class="text-sm text-muted-foreground">
						Drop all tables, re-run migrations, and return to setup. All data will be permanently lost.
					</p>
				</div>
				<Dialog.Root bind:open={dialogOpen}>
					<Dialog.Trigger>
						{#snippet child({ props })}
							<Button variant="destructive" {...props}>Reset Database</Button>
						{/snippet}
					</Dialog.Trigger>
					<Dialog.Content class="sm:max-w-md">
						<Dialog.Header>
							<Dialog.Title>Reset Database</Dialog.Title>
							<Dialog.Description>
								This will permanently delete all targets, API keys, users, and audit logs. This action cannot be undone.
							</Dialog.Description>
						</Dialog.Header>
						<form
							method="POST"
							action="?/resetDatabase"
							use:enhance={() => {
								submitting = true;
								return async ({ update }) => {
									submitting = false;
									await update();
								};
							}}
						>
							<div class="flex flex-col gap-4">
								<div>
									<label for="confirm" class="text-sm font-medium">
										Type <span class="font-mono font-bold">reset my database</span> to confirm
									</label>
									<Input
										id="confirm"
										class="mt-1.5"
										placeholder="reset my database"
										bind:value={confirmText}
										autocomplete="off"
									/>
								</div>
								<Dialog.Footer>
									<Dialog.Close>
										{#snippet child({ props })}
											<Button variant="outline" {...props}>Cancel</Button>
										{/snippet}
									</Dialog.Close>
									<Button
										type="submit"
										variant="destructive"
										disabled={confirmText !== "reset my database" || submitting}
									>
										{submitting ? "Resetting..." : "Reset Database"}
									</Button>
								</Dialog.Footer>
							</div>
						</form>
					</Dialog.Content>
				</Dialog.Root>
			</div>
		</Card.Content>
	</Card.Root>
</div>
