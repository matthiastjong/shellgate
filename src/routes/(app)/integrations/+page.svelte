<script lang="ts">
	import { enhance } from "$app/forms";
	import { page } from "$app/state";
	import * as Breadcrumb from "$lib/components/ui/breadcrumb/index.js";
	import * as Card from "$lib/components/ui/card/index.js";
	import * as Dialog from "$lib/components/ui/dialog/index.js";
	import { Button } from "$lib/components/ui/button/index.js";
	import { Badge } from "$lib/components/ui/badge/index.js";
	import LinkIcon from "@lucide/svelte/icons/link";
	import UnlinkIcon from "@lucide/svelte/icons/unlink";
	import CircleCheckIcon from "@lucide/svelte/icons/circle-check";
	import CircleXIcon from "@lucide/svelte/icons/circle-x";
	import { toast } from "svelte-sonner";

	let { data } = $props();

	let disconnectDialogOpen = $state(false);
	let disconnectAccountId = $state("");
	let disconnectEmail = $state("");
	let disconnectSubmitting = $state(false);

	let localAccounts = $state<typeof data.accounts | null>(null);
	let accounts = $derived(localAccounts ?? data.accounts);

	// Show toast for OAuth redirect results
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
		<Card.Root>
			<Card.Header>
				<Card.Title>Connect a new account</Card.Title>
				<Card.Description>Sign in with an external provider to automatically create managed targets.</Card.Description>
			</Card.Header>
			<Card.Content>
				<div class="flex flex-wrap gap-3">
					{#each data.providers as provider (provider.id)}
						<Button href="/oauth/authorize?provider={provider.id}">
							<LinkIcon class="mr-2 size-4" />
							Connect {provider.name}
						</Button>
					{/each}
				</div>
			</Card.Content>
		</Card.Root>
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

	{#if accounts.length > 0}
		<div class="grid gap-4">
			{#each accounts as account (account.id)}
				<Card.Root>
					<Card.Header>
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-3">
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
							<Button
								variant="outline"
								size="sm"
								onclick={() => openDisconnectDialog(account.id, account.email)}
							>
								<UnlinkIcon class="mr-2 size-4" />
								Disconnect
							</Button>
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
										<Badge variant="secondary" class="cursor-pointer hover:bg-muted">
											{target.name}
										</Badge>
									</a>
								{/each}
							</div>
						{:else}
							<p class="text-muted-foreground text-sm">No managed targets.</p>
						{/if}
						<p class="text-muted-foreground mt-3 text-xs">Connected {formatDate(account.createdAt)}</p>
					</Card.Content>
				</Card.Root>
			{/each}
		</div>
	{:else if data.providers.length > 0}
		<div class="text-muted-foreground flex flex-col items-center justify-center rounded-lg border border-dashed py-12">
			<p class="text-sm">No connected accounts yet.</p>
			<p class="text-muted-foreground text-xs">Use the button above to connect your first account.</p>
		</div>
	{/if}
</div>

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
