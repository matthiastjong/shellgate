<script lang="ts">
	import { enhance } from "$app/forms";
	import { page } from "$app/state";
	import * as Breadcrumb from "$lib/components/ui/breadcrumb/index.js";
	import * as Card from "$lib/components/ui/card/index.js";
	import * as Dialog from "$lib/components/ui/dialog/index.js";
	import { Button } from "$lib/components/ui/button/index.js";
	import { Badge } from "$lib/components/ui/badge/index.js";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import UnlinkIcon from "@lucide/svelte/icons/unlink";
	import CircleCheckIcon from "@lucide/svelte/icons/circle-check";
	import CircleXIcon from "@lucide/svelte/icons/circle-x";
	import MailIcon from "@lucide/svelte/icons/mail";
	import CalendarIcon from "@lucide/svelte/icons/calendar";
	import KeyIcon from "@lucide/svelte/icons/key-round";
	import { Switch } from "$lib/components/ui/switch/index.js";
	import { toast } from "svelte-sonner";

	let { data } = $props();

	let addDialogOpen = $state(false);
	let disconnectDialogOpen = $state(false);
	let disconnectAccountId = $state("");
	let disconnectEmail = $state("");
	let disconnectSubmitting = $state(false);

	let manageDialogOpen = $state(false);
	let manageAccountId = $state("");
	let manageEmail = $state("");

	let localAccounts = $state<typeof data.accounts | null>(null);
	let accounts = $derived(localAccounts ?? data.accounts);

	$effect(() => {
		const success = page.url.searchParams.get("success");
		const error = page.url.searchParams.get("error");
		if (success === "connected") {
			toast.success("Account connected successfully");
		} else if (error) {
			toast.error(`Connection failed: ${error}`);
		}
	});

	function openDisconnectDialog(accountId: string, email: string) {
		disconnectAccountId = accountId;
		disconnectEmail = email;
		disconnectDialogOpen = true;
	}

	function formatDate(d: string | Date) {
		return new Date(d).toLocaleDateString("en-US", {
			month: "short",
			day: "numeric",
			year: "numeric",
		});
	}
</script>

<div class="flex flex-col gap-6">
	<div class="flex items-center justify-between">
		<div>
			<Breadcrumb.Root>
				<Breadcrumb.List>
					<Breadcrumb.Item>
						<Breadcrumb.Link href="/">Shellgate</Breadcrumb.Link>
					</Breadcrumb.Item>
					<Breadcrumb.Separator />
					<Breadcrumb.Item>
						<Breadcrumb.Page>Connected Accounts</Breadcrumb.Page>
					</Breadcrumb.Item>
				</Breadcrumb.List>
			</Breadcrumb.Root>
			<h1 class="mt-1 text-2xl font-bold tracking-tight">Connected Accounts</h1>
			<p class="text-muted-foreground text-sm">Connect external accounts to automatically provision mail and calendar targets.</p>
		</div>
		{#if data.providers.length > 0}
			<Button onclick={() => { addDialogOpen = true; }}>
				<PlusIcon class="mr-2 size-4" />
				Add Integration
			</Button>
		{/if}
	</div>

	{#if accounts.length > 0}
		<div class="grid gap-4">
			{#each accounts as account (account.id)}
				<Card.Root>
					<Card.Header>
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-3">
								<div class="flex size-10 items-center justify-center rounded-lg bg-[#dc3e15]/10">
									<!-- svelte-ignore a11y_missing_attribute -->
									<svg viewBox="0 0 23 23" class="size-5" fill="none" xmlns="http://www.w3.org/2000/svg">
										<rect x="1" y="1" width="10" height="10" fill="#f25022"/>
										<rect x="12" y="1" width="10" height="10" fill="#7fba00"/>
										<rect x="1" y="12" width="10" height="10" fill="#00a4ef"/>
										<rect x="12" y="12" width="10" height="10" fill="#ffb900"/>
									</svg>
								</div>
								<div>
									<Card.Title class="flex items-center gap-2">
										{account.email}
										{#if account.status === "connected"}
											<Badge variant="default" class="bg-green-600 hover:bg-green-700">
												<CircleCheckIcon class="mr-1 size-3" />
												Connected
											</Badge>
										{:else}
											<Badge variant="destructive">
												<CircleXIcon class="mr-1 size-3" />
												{account.status === "error" ? "Error" : "Disconnected"}
											</Badge>
										{/if}
									</Card.Title>
									<Card.Description>
										{account.provider.name}{#if account.displayName} &middot; {account.displayName}{/if}
									</Card.Description>
								</div>
							</div>
							<div class="flex gap-2">
								<Button
									variant="outline"
									size="sm"
									onclick={() => {
										manageAccountId = account.id;
										manageEmail = account.email;
										manageDialogOpen = true;
									}}
								>
									<KeyIcon class="mr-2 size-4" />
									Manage
								</Button>
								<Button
									variant="outline"
									size="sm"
									onclick={() => openDisconnectDialog(account.id, account.email)}
								>
									<UnlinkIcon class="mr-2 size-4" />
									Disconnect
								</Button>
							</div>
						</div>
					</Card.Header>
					<Card.Content>
						{#if account.statusMessage}
							<p class="text-destructive mb-3 text-sm">{account.statusMessage}</p>
						{/if}
						{#if account.managedTargets.length > 0}
							<div class="flex flex-wrap gap-2">
								{#each account.managedTargets as target (target.id)}
									<a href="/targets/{target.slug}">
										<Badge variant="secondary" class="cursor-pointer gap-1.5 hover:bg-muted">
											{#if target.capability === "mail"}
												<MailIcon class="size-3" />
											{:else if target.capability === "calendar"}
												<CalendarIcon class="size-3" />
											{/if}
											{target.capability === "mail" ? "Mail" : "Calendar"}
										</Badge>
									</a>
								{/each}
							</div>
						{:else}
							<p class="text-muted-foreground text-sm">No managed targets.</p>
						{/if}
						<p class="text-muted-foreground mt-3 text-xs">
							Connected {formatDate(account.createdAt)}
							{#if account.tokenAccess.filter((t) => t.hasAccess).length > 0}
								&middot; {account.tokenAccess.filter((t) => t.hasAccess).length} API key{account.tokenAccess.filter((t) => t.hasAccess).length !== 1 ? "s" : ""} with access
							{:else}
								&middot; No API keys have access
							{/if}
						</p>
					</Card.Content>
				</Card.Root>
			{/each}
		</div>
	{:else if data.providers.length > 0}
		<div class="text-muted-foreground flex flex-col items-center justify-center rounded-lg border border-dashed py-16">
			<div class="mb-4 rounded-full bg-muted p-3">
				<PlusIcon class="size-6" />
			</div>
			<p class="font-medium text-foreground">No connected accounts yet</p>
			<p class="mt-1 text-xs">Click "Add Integration" to connect your first account.</p>
		</div>
	{:else}
		<Card.Root>
			<Card.Header>
				<Card.Title>No providers configured</Card.Title>
				<Card.Description>
					Set the <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">OAUTH_MICROSOFT_CLIENT_ID</code> and <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">OAUTH_MICROSOFT_CLIENT_SECRET</code> environment variables to enable Microsoft 365 integration.
				</Card.Description>
			</Card.Header>
		</Card.Root>
	{/if}
</div>

<!-- Add Integration Dialog -->
<Dialog.Root bind:open={addDialogOpen}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Add Integration</Dialog.Title>
			<Dialog.Description>
				Choose a provider to connect your account. You'll be redirected to sign in.
			</Dialog.Description>
		</Dialog.Header>
		<div class="grid gap-3 py-4">
			{#each data.providers as provider (provider.type)}
				<a
					href="/oauth/authorize?provider={provider.type}"
					class="flex items-center gap-4 rounded-lg border p-4 transition-colors hover:bg-accent"
				>
					<div class="flex size-12 items-center justify-center rounded-lg bg-[#dc3e15]/10">
						<!-- svelte-ignore a11y_missing_attribute -->
						<svg viewBox="0 0 23 23" class="size-6" fill="none" xmlns="http://www.w3.org/2000/svg">
							<rect x="1" y="1" width="10" height="10" fill="#f25022"/>
							<rect x="12" y="1" width="10" height="10" fill="#7fba00"/>
							<rect x="1" y="12" width="10" height="10" fill="#00a4ef"/>
							<rect x="12" y="12" width="10" height="10" fill="#ffb900"/>
						</svg>
					</div>
					<div class="flex-1">
						<p class="font-medium">{provider.name}</p>
						<p class="text-sm text-muted-foreground">Mail and Calendar via Microsoft Graph</p>
					</div>
					<svg class="size-5 text-muted-foreground" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
						<path fill-rule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clip-rule="evenodd" />
					</svg>
				</a>
			{/each}
		</div>
	</Dialog.Content>
</Dialog.Root>

<!-- Manage Access Dialog -->
<Dialog.Root bind:open={manageDialogOpen} onOpenChange={(open) => { if (!open) { manageAccountId = ""; manageEmail = ""; } }}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Manage Access</Dialog.Title>
			<Dialog.Description>
				Grant or revoke API key access to all targets of <strong>{manageEmail}</strong>.
			</Dialog.Description>
		</Dialog.Header>
		<div class="grid gap-2 py-4">
			{#each accounts.find((a) => a.id === manageAccountId)?.tokenAccess ?? [] as ta (ta.tokenId)}
				<div class="flex items-center justify-between rounded-lg border p-3">
					<div class="flex items-center gap-2">
						<KeyIcon class="size-4 text-muted-foreground" />
						<span class="text-sm font-medium">{ta.tokenName}</span>
					</div>
					<form
						id="access-form-{ta.tokenId}"
						method="POST"
						action={ta.hasAccess ? "?/revokeAccess" : "?/grantAccess"}
						use:enhance={() => {
							return async ({ result, update }) => {
								if (result.type === "success") {
									toast.success(ta.hasAccess ? `Revoked access for ${ta.tokenName}` : `Granted access for ${ta.tokenName}`);
									await update({ invalidateAll: true });
								}
							};
						}}
					>
						<input type="hidden" name="accountId" value={manageAccountId} />
						<input type="hidden" name="tokenId" value={ta.tokenId} />
					</form>
					<Switch
						checked={ta.hasAccess}
						onCheckedChange={() => (document.getElementById(`access-form-${ta.tokenId}`) as HTMLFormElement)?.requestSubmit()}
					/>
				</div>
			{/each}
		</div>
	</Dialog.Content>
</Dialog.Root>

<!-- Disconnect Confirmation Dialog -->
<Dialog.Root bind:open={disconnectDialogOpen} onOpenChange={(open) => { if (!open) { disconnectAccountId = ""; disconnectEmail = ""; } }}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Disconnect Account</Dialog.Title>
			<Dialog.Description>
				This will permanently disconnect <strong>{disconnectEmail}</strong> and delete all managed targets and their permissions. This action cannot be undone.
			</Dialog.Description>
		</Dialog.Header>
		<form
			method="POST"
			action="?/disconnect"
			use:enhance={() => {
				disconnectSubmitting = true;
				return async ({ result, update }) => {
					disconnectSubmitting = false;
					if (result.type === "success" && result.data?.success) {
						localAccounts = accounts.filter((a) => a.id !== disconnectAccountId);
						disconnectDialogOpen = false;
						toast.success("Account disconnected");
					} else if (result.type === "failure") {
						toast.error((result.data?.error as string) ?? "Failed to disconnect");
					}
					await update({ reset: false, invalidateAll: false });
				};
			}}
		>
			<input type="hidden" name="accountId" value={disconnectAccountId} />
			<Dialog.Footer>
				<Button variant="outline" onclick={() => { disconnectDialogOpen = false; }}>Cancel</Button>
				<Button type="submit" variant="destructive" disabled={disconnectSubmitting}>
					{disconnectSubmitting ? "Disconnecting..." : "Disconnect"}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
