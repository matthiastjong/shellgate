<script lang="ts">
	import { enhance } from "$app/forms";
	import * as Breadcrumb from "$lib/components/ui/breadcrumb/index.js";
	import * as Card from "$lib/components/ui/card/index.js";
	import * as Dialog from "$lib/components/ui/dialog/index.js";
	import { Button } from "$lib/components/ui/button/index.js";
	import { Input } from "$lib/components/ui/input/index.js";
	import { Badge } from "$lib/components/ui/badge/index.js";
	import { Label } from "$lib/components/ui/label/index.js";
	import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import TrashIcon from "@lucide/svelte/icons/trash-2";
	import type { PageData } from "./$types";

	let { data }: { data: PageData } = $props();

	let confirmText = $state("");
	let dialogOpen = $state(false);
	let submitting = $state(false);

	let addDialogOpen = $state(false);
	let addSubmitting = $state(false);
	let deleteDialogOpen = $state(false);
	let deleteProviderId = $state("");
	let deleteSubmitting = $state(false);

	let localProviders = $state<typeof data.providers | null>(null);
	let providerList = $derived(localProviders ?? data.providers);
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

	<Card.Root>
		<Card.Header>
			<div class="flex items-center justify-between">
				<div>
					<Card.Title>Integration Providers</Card.Title>
					<Card.Description>
						Configure OAuth providers for account connections.
					</Card.Description>
				</div>
				<Dialog.Root bind:open={addDialogOpen}>
					<Dialog.Trigger>
						{#snippet child({ props })}
							<Button size="sm" {...props}>
								<PlusIcon class="mr-1.5 size-4" />
								Add Provider
							</Button>
						{/snippet}
					</Dialog.Trigger>
					<Dialog.Content class="sm:max-w-lg">
						<Dialog.Header>
							<Dialog.Title>Add Integration Provider</Dialog.Title>
							<Dialog.Description>
								Configure an OAuth provider for connecting accounts.
							</Dialog.Description>
						</Dialog.Header>
						<form
							method="POST"
							action="?/createProvider"
							use:enhance={() => {
								addSubmitting = true;
								return async ({ result, update }) => {
									addSubmitting = false;
									if (result.type === "success") {
										addDialogOpen = false;
										localProviders = null;
										await update({ invalidateAll: true });
									}
								};
							}}
						>
							<div class="flex flex-col gap-4">
								<div class="grid gap-2">
									<Label for="provider-name">Name</Label>
									<Input id="provider-name" name="name" value="Microsoft 365" required />
								</div>
								<div class="grid gap-2">
									<Label for="provider-type">Type</Label>
									<Input id="provider-type" name="type" value="microsoft_365" required />
								</div>
								<div class="grid gap-2">
									<Label for="provider-client-id">Client ID</Label>
									<Input id="provider-client-id" name="clientId" placeholder="Application (client) ID" required />
								</div>
								<div class="grid gap-2">
									<Label for="provider-client-secret">Client Secret</Label>
									<Input id="provider-client-secret" name="clientSecret" type="password" placeholder="Client secret value" required />
								</div>
								<div class="grid gap-2">
									<Label for="provider-scopes">Scopes</Label>
									<textarea
										id="provider-scopes"
										name="scopes"
										class="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-[80px] w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
										required
									>Mail.ReadWrite Mail.Send Calendars.ReadWrite offline_access User.Read</textarea>
								</div>
								<div class="grid gap-2">
									<Label for="provider-auth-url">Authorization URL</Label>
									<Input id="provider-auth-url" name="authUrl" value="https://login.microsoftonline.com/common/oauth2/v2.0/authorize" required />
								</div>
								<div class="grid gap-2">
									<Label for="provider-token-url">Token URL</Label>
									<Input id="provider-token-url" name="tokenUrl" value="https://login.microsoftonline.com/common/oauth2/v2.0/token" required />
								</div>
								<Dialog.Footer>
									<Dialog.Close>
										{#snippet child({ props })}
											<Button variant="outline" {...props}>Cancel</Button>
										{/snippet}
									</Dialog.Close>
									<Button type="submit" disabled={addSubmitting}>
										{addSubmitting ? "Creating..." : "Create Provider"}
									</Button>
								</Dialog.Footer>
							</div>
						</form>
					</Dialog.Content>
				</Dialog.Root>
			</div>
		</Card.Header>
		<Card.Content>
			{#if providerList.length === 0}
				<p class="text-sm text-muted-foreground">No providers configured yet.</p>
			{:else}
				<div class="divide-y rounded-lg border">
					{#each providerList as provider}
						<div class="flex items-center justify-between p-4">
							<div class="flex flex-col gap-1">
								<div class="flex items-center gap-2">
									<span class="font-medium">{provider.name}</span>
									<Badge variant={provider.enabled ? "default" : "secondary"}>
										{provider.enabled ? "Enabled" : "Disabled"}
									</Badge>
								</div>
								<div class="flex items-center gap-3 text-sm text-muted-foreground">
									<span>{provider.type}</span>
									<span class="font-mono">{provider.clientId.slice(0, 8)}...</span>
								</div>
							</div>
							<Button
								variant="ghost"
								size="icon"
								onclick={() => {
									deleteProviderId = provider.id;
									deleteDialogOpen = true;
								}}
							>
								<TrashIcon class="size-4 text-destructive" />
							</Button>
						</div>
					{/each}
				</div>
			{/if}
		</Card.Content>
	</Card.Root>

	<Dialog.Root bind:open={deleteDialogOpen}>
		<Dialog.Content class="sm:max-w-md">
			<Dialog.Header>
				<Dialog.Title>Delete Provider</Dialog.Title>
				<Dialog.Description>
					This will permanently delete this integration provider and disconnect all associated accounts. This action cannot be undone.
				</Dialog.Description>
			</Dialog.Header>
			<form
				method="POST"
				action="?/deleteProvider"
				use:enhance={() => {
					deleteSubmitting = true;
					return async ({ result, update }) => {
						deleteSubmitting = false;
						if (result.type === "success") {
							deleteDialogOpen = false;
							localProviders = null;
							await update({ invalidateAll: true });
						}
					};
				}}
			>
				<input type="hidden" name="id" value={deleteProviderId} />
				<Dialog.Footer>
					<Dialog.Close>
						{#snippet child({ props })}
							<Button variant="outline" {...props}>Cancel</Button>
						{/snippet}
					</Dialog.Close>
					<Button type="submit" variant="destructive" disabled={deleteSubmitting}>
						{deleteSubmitting ? "Deleting..." : "Delete Provider"}
					</Button>
				</Dialog.Footer>
			</form>
		</Dialog.Content>
	</Dialog.Root>

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
