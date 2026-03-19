<script lang="ts">
import { enhance } from "$app/forms";
import { page } from "$app/state";
import { toast } from "svelte-sonner";
import { Button } from "$lib/components/ui/button/index.js";
import { Badge } from "$lib/components/ui/badge/index.js";
import * as Table from "$lib/components/ui/table/index.js";
import * as Dialog from "$lib/components/ui/dialog/index.js";
import * as Sheet from "$lib/components/ui/sheet/index.js";
import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
import * as Tooltip from "$lib/components/ui/tooltip/index.js";
import * as Breadcrumb from "$lib/components/ui/breadcrumb/index.js";
import { Input } from "$lib/components/ui/input/index.js";
import { Label } from "$lib/components/ui/label/index.js";
import { Switch } from "$lib/components/ui/switch/index.js";
import PlusIcon from "@lucide/svelte/icons/plus";
import KeyRoundIcon from "@lucide/svelte/icons/key-round";
import CopyIcon from "@lucide/svelte/icons/copy";
import InfoIcon from "@lucide/svelte/icons/info";
import CheckIcon from "@lucide/svelte/icons/check";
import EllipsisIcon from "@lucide/svelte/icons/ellipsis";
import LoaderCircleIcon from "@lucide/svelte/icons/loader-circle";
import { browser } from "$app/environment";
import type { PageData } from "./$types";

type Token = {
	id: string;
	name: string;
	createdAt: string | Date;
	revokedAt: string | Date | null;
	lastUsedAt: string | Date | null;
	updatedAt: string | Date;
	targetCount: number;
};

type Target = {
	id: string;
	name: string;
	slug: string;
	type: string;
	baseUrl: string | null;
	enabled: boolean;
};

let { data }: { data: PageData } = $props();

let localTokens = $state<Token[] | null>(null);
let tokenList = $derived<Token[]>(localTokens ?? data.tokens as Token[]);
let sheetOpen = $state(false);
let revealOpen = $state(false);
let revealedToken = $state("");
let revealedTargetSlug = $state<string | null>(null);
let copied = $state(false);
let submitting = $state(false);
let confirmRevokeId = $state<string | null>(null);
let confirmRegenerateId = $state<string | null>(null);

// Rename sheet state
let renameId = $state<string | null>(null);
let renameName = $state("");
let renameSubmitting = $state(false);

// Create wizard state
let createStep = $state<0 | 1 | 2>(0);
let createName = $state("");
let selectedTargetIds = $state<Set<string>>(new Set());

let gatewayUrl = $derived(page.url.origin);
let selectedCount = $derived(selectedTargetIds.size);

function updateTokenList(updater: (tokens: Token[]) => Token[]) {
	localTokens = updater(tokenList);
}

function formatRelativeTime(dateStr: string | Date | null): string {
	if (!dateStr) return "Never";
	if (!browser) return formatDate(dateStr);
	const date = new Date(dateStr);
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffSec = Math.floor(diffMs / 1000);
	const diffMin = Math.floor(diffSec / 60);
	const diffHour = Math.floor(diffMin / 60);
	const diffDay = Math.floor(diffHour / 24);

	const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
	if (diffDay > 0) return rtf.format(-diffDay, "day");
	if (diffHour > 0) return rtf.format(-diffHour, "hour");
	if (diffMin > 0) return rtf.format(-diffMin, "minute");
	return rtf.format(-diffSec, "second");
}

function formatDate(dateStr: string | Date): string {
	return new Date(dateStr).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}

async function copyToClipboard(text: string) {
	await navigator.clipboard.writeText(text);
	copied = true;
	setTimeout(() => (copied = false), 2000);
}

function openCreateSheet() {
	renameId = null;
	renameName = "";
	createStep = 0;
	createName = "";
	selectedTargetIds = new Set();
	sheetOpen = true;
}

function openRenameSheet(token: Token) {
	renameId = token.id;
	renameName = token.name;
	sheetOpen = true;
}

function toggleTarget(targetId: string) {
	const next = new Set(selectedTargetIds);
	if (next.has(targetId)) {
		next.delete(targetId);
	} else {
		next.add(targetId);
	}
	selectedTargetIds = next;
}
</script>

<!-- Create / Rename Sheet -->
<Sheet.Root bind:open={sheetOpen}>
	<Sheet.Content side="right">
		{#if renameId}
			<Sheet.Header>
				<Sheet.Title>Rename API Key</Sheet.Title>
				<Sheet.Description>Update the name for this API key.</Sheet.Description>
			</Sheet.Header>
			<form
				method="POST"
				action="?/rename"
				use:enhance={() => {
					renameSubmitting = true;
					return async ({ result, update }) => {
						renameSubmitting = false;
						if (result.type === 'success' && result.data?.renamed) {
							const { id, name } = result.data.renamed as { id: string; name: string };
							updateTokenList((tokens) => tokens.map((t) => (t.id === id ? { ...t, name } : t)));
							sheetOpen = false;
							toast.success('Key renamed');
						} else if (result.type === 'failure') {
							toast.error((result.data?.error as string) ?? 'Failed to rename key');
						}
						await update({ reset: false, invalidateAll: false });
					};
				}}
			>
				<input type="hidden" name="id" value={renameId} />
				<div class="grid gap-4 px-4">
					<div class="grid gap-2">
						<Label for="rename-name">Name</Label>
						<Input id="rename-name" name="name" bind:value={renameName} placeholder="e.g. Production Agent" required />
					</div>
					<Button type="submit" disabled={renameSubmitting || !renameName.trim()}>
						{#if renameSubmitting}
							<LoaderCircleIcon class="mr-2 size-4 animate-spin" />
						{/if}
						Save
					</Button>
				</div>
			</form>
		{:else if createStep === 0}
			<!-- Step 1: Name -->
			<Sheet.Header>
				<Sheet.Title>Create API Key</Sheet.Title>
				<Sheet.Description>Give your key a name to identify which agent or purpose it belongs to.</Sheet.Description>
			</Sheet.Header>
			<div class="grid gap-4 px-4">
				<div class="grid gap-2">
					<Label for="create-name">Name</Label>
					<Input id="create-name" bind:value={createName} placeholder="e.g. Production Agent" />
				</div>
				<Button disabled={!createName.trim()} onclick={() => (createStep = 1)}>
					Next
				</Button>
			</div>
		{:else if createStep === 1}
			<!-- Step 2: Permissions -->
			<Sheet.Header>
				<Sheet.Title>Select Targets ({selectedCount} selected)</Sheet.Title>
				<Sheet.Description>Choose which targets this API key can access.</Sheet.Description>
			</Sheet.Header>
			<div class="flex flex-col gap-4 px-4">
				{#if (data.targets as Target[]).length === 0}
					<p class="text-muted-foreground text-sm">No targets yet — you can add permissions later.</p>
				{:else}
					<div class="flex flex-col gap-2">
						{#each data.targets as target (target.id)}
							<div class="flex items-center justify-between rounded-lg border p-3">
								<div class="flex flex-col gap-0.5">
									<div class="flex items-center gap-2">
										<span class="text-sm font-medium">{target.name}</span>
										<Badge variant="outline" class="text-xs">{target.type}</Badge>
									</div>
									{#if target.baseUrl}
										<span class="text-muted-foreground text-xs font-mono">{target.baseUrl}</span>
									{/if}
								</div>
								<Switch
									checked={selectedTargetIds.has(target.id)}
									onCheckedChange={() => toggleTarget(target.id)}
								/>
							</div>
						{/each}
					</div>
				{/if}
				<div class="flex gap-2">
					<Button variant="outline" class="flex-1" onclick={() => (createStep = 0)}>Back</Button>
					<form
						method="POST"
						action="?/create"
						class="flex-1"
						use:enhance={() => {
							submitting = true;
							return async ({ result, update }) => {
								submitting = false;
								if (result.type === 'success' && result.data?.created) {
									const created = result.data.created as Token & { token: string };
									updateTokenList((tokens) => [...tokens, {
										id: created.id,
										name: created.name,
										createdAt: created.createdAt,
										revokedAt: null,
										lastUsedAt: null,
										updatedAt: created.createdAt,
										targetCount: created.targetCount ?? 0,
									}]);
									sheetOpen = false;
									revealedToken = created.token;
									// Pick the first selected target slug for the curl example
									const selectedTarget = (data.targets as Target[]).find((t) => selectedTargetIds.has(t.id));
									revealedTargetSlug = selectedTarget?.slug ?? null;
									revealOpen = true;
									toast.success('API key created');
								} else if (result.type === 'failure') {
									toast.error((result.data?.error as string) ?? 'Failed to create key');
								}
								await update({ reset: true, invalidateAll: false });
							};
						}}
					>
						<input type="hidden" name="name" value={createName} />
						<input type="hidden" name="targetIds" value={[...selectedTargetIds].join(",")} />
						<Button type="submit" class="w-full" disabled={submitting}>
							{#if submitting}
								<LoaderCircleIcon class="mr-2 size-4 animate-spin" />
							{/if}
							{selectedCount > 0 ? `Create Key with ${selectedCount} target${selectedCount > 1 ? 's' : ''}` : 'Create Key'}
						</Button>
					</form>
				</div>
				{#if (data.targets as Target[]).length > 0}
					<button
						type="button"
						class="text-muted-foreground text-xs underline"
						onclick={() => {
							selectedTargetIds = new Set();
							document.querySelector<HTMLFormElement>('[action="?/create"]')?.requestSubmit();
						}}
					>
						Skip — create without permissions
					</button>
				{/if}
			</div>
		{/if}
	</Sheet.Content>
</Sheet.Root>

<!-- Reveal Dialog -->
<Dialog.Root bind:open={revealOpen}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>API Key Created</Dialog.Title>
			<Dialog.Description>
				Copy your new API key. You won't be able to see it again.
			</Dialog.Description>
		</Dialog.Header>
		<div class="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950">
			<div class="flex items-center gap-2">
				<code class="text-amber-900 dark:text-amber-100 flex-1 break-all font-mono text-sm">{revealedToken}</code>
				<Button
					variant="outline"
					size="sm"
					onclick={() => copyToClipboard(revealedToken)}
				>
					{#if copied}
						<CheckIcon class="mr-1 size-3.5" />
						Copied
					{:else}
						<CopyIcon class="mr-1 size-3.5" />
						Copy
					{/if}
				</Button>
			</div>
		</div>
		{#if revealedTargetSlug}
			<div class="mt-2">
				<p class="text-muted-foreground mb-1 text-xs font-medium">Example usage:</p>
				<div class="rounded-lg border bg-muted/50 p-3">
					<pre class="break-all font-mono text-xs whitespace-pre-wrap">{`curl ${gatewayUrl}/gateway/${revealedTargetSlug}/v1/chat/completions \
  -H "Authorization: Bearer ${revealedToken}"`}</pre>
				</div>
			</div>
		{/if}
		<p class="text-muted-foreground text-sm">
			&#x26A0;&#xFE0F; This key will not be shown again. Copy it now and store it securely.
		</p>
		<Dialog.Footer>
			<Button onclick={() => (revealOpen = false)}>Done, I've copied it</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<!-- Page Content -->
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
						<Breadcrumb.Page>API Keys</Breadcrumb.Page>
					</Breadcrumb.Item>
				</Breadcrumb.List>
			</Breadcrumb.Root>
			<h1 class="mt-1 text-2xl font-bold tracking-tight">API Keys</h1>
		</div>
		{#if tokenList.length > 0}
			<Button onclick={openCreateSheet}>
				<PlusIcon class="mr-2 size-4" />
				Create API Key
			</Button>
		{/if}
	</div>

	{#if tokenList.length === 0}
		<!-- Empty state -->
		<div class="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed py-16">
			<div class="bg-muted flex size-12 items-center justify-center rounded-full">
				<KeyRoundIcon class="text-muted-foreground size-6" />
			</div>
			<div class="text-center">
				<h2 class="text-lg font-semibold">No API keys yet</h2>
				<p class="text-muted-foreground mt-1 text-sm">
					Create your first key to give an agent access to your targets.
				</p>
			</div>
			<Button onclick={openCreateSheet}>
				<PlusIcon class="mr-2 size-4" />
				Create API Key
			</Button>
		</div>
	{:else}
		<!-- Data table -->
		<div class="rounded-lg border">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>Name</Table.Head>
						<Table.Head>Key</Table.Head>
						<Table.Head>Status</Table.Head>
						<Table.Head>Targets</Table.Head>
						<Table.Head>Last used</Table.Head>
						<Table.Head>Created</Table.Head>
						<Table.Head>Updated</Table.Head>
						<Table.Head class="w-12"><span class="sr-only">Actions</span></Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each tokenList as token (token.id)}
						{#if confirmRevokeId === token.id}
							<Table.Row class="bg-red-50 dark:bg-red-950/30">
								<Table.Cell colspan={8}>
									<div class="flex items-center justify-between gap-4 py-1">
										<p class="text-sm">
											Revoke this key? Agents using it will lose access immediately.
										</p>
										<div class="flex shrink-0 gap-2">
											<Button variant="outline" size="sm" onclick={() => (confirmRevokeId = null)}>Cancel</Button>
											<form
												method="POST"
												action="?/revoke"
												use:enhance={() => {
													return async ({ result, update }) => {
														if (result.type === 'success' && result.data?.revoked) {
															const revokedId = result.data.revoked as string;
															updateTokenList((tokens) => tokens.map((t) =>
																t.id === revokedId ? { ...t, revokedAt: new Date().toISOString() } : t
															));
															confirmRevokeId = null;
															toast.success('Key revoked');
														} else if (result.type === 'failure') {
															toast.error((result.data?.error as string) ?? 'Failed to revoke key');
														}
														await update({ reset: false, invalidateAll: false });
													};
												}}
											>
												<input type="hidden" name="id" value={token.id} />
												<Button type="submit" variant="destructive" size="sm">Yes, revoke</Button>
											</form>
										</div>
									</div>
								</Table.Cell>
							</Table.Row>
						{:else if confirmRegenerateId === token.id}
							<Table.Row class="bg-amber-50 dark:bg-amber-950/30">
								<Table.Cell colspan={8}>
									<div class="flex items-center justify-between gap-4 py-1">
										<p class="text-sm">
											Regenerate this key? The current key will stop working immediately.
										</p>
										<div class="flex shrink-0 gap-2">
											<Button variant="outline" size="sm" onclick={() => (confirmRegenerateId = null)}>Cancel</Button>
											<form
												method="POST"
												action="?/regenerate"
												use:enhance={() => {
													return async ({ result, update }) => {
														if (result.type === 'success' && result.data?.regenerated) {
															const regenerated = result.data.regenerated as Token & { token: string };
															updateTokenList((tokens) => tokens.map((t) =>
																t.id === token.id ? { ...t, updatedAt: regenerated.updatedAt } : t
															));
															confirmRegenerateId = null;
															revealedToken = regenerated.token;
															revealedTargetSlug = null;
															revealOpen = true;
															toast.success('Key regenerated');
														} else if (result.type === 'failure') {
															toast.error((result.data?.error as string) ?? 'Failed to regenerate key');
														}
														await update({ reset: false, invalidateAll: false });
													};
												}}
											>
												<input type="hidden" name="id" value={token.id} />
												<Button type="submit" class="bg-amber-600 text-white hover:bg-amber-700" size="sm">Yes, regenerate</Button>
											</form>
										</div>
									</div>
								</Table.Cell>
							</Table.Row>
						{:else}
							<Table.Row>
								<Table.Cell class="font-medium">
									<a href="/api-keys/{token.id}" class="hover:underline">{token.name}</a>
								</Table.Cell>
								<Table.Cell>
									<div class="flex items-center gap-1.5">
										<span class="text-muted-foreground font-mono text-sm">sg_&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;</span>
										<Tooltip.Root>
											<Tooltip.Trigger>
												<InfoIcon class="text-muted-foreground size-3.5" />
											</Tooltip.Trigger>
											<Tooltip.Content>
												<p>Key is only shown once at creation. Use "Regenerate" to get a new value.</p>
											</Tooltip.Content>
										</Tooltip.Root>
									</div>
								</Table.Cell>
								<Table.Cell>
									{#if token.revokedAt}
										<Badge variant="secondary">Revoked</Badge>
									{:else}
										<Badge class="border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300">Active</Badge>
									{/if}
								</Table.Cell>
								<Table.Cell class="text-muted-foreground text-sm">
									{#if token.targetCount > 0}
										{token.targetCount} target{token.targetCount > 1 ? 's' : ''}
									{:else}
										<span class="text-muted-foreground/60">No targets</span>
									{/if}
								</Table.Cell>
								<Table.Cell class="text-muted-foreground text-sm">{formatRelativeTime(token.lastUsedAt)}</Table.Cell>
								<Table.Cell class="text-muted-foreground text-sm">{formatDate(token.createdAt)}</Table.Cell>
								<Table.Cell class="text-muted-foreground text-sm">{formatRelativeTime(token.updatedAt)}</Table.Cell>
								<Table.Cell>
								{#if !token.revokedAt}
									<DropdownMenu.Root>
										<DropdownMenu.Trigger>
											{#snippet child({ props })}
												<Button variant="ghost" size="icon" class="size-8" {...props}>
													<EllipsisIcon class="size-4" />
													<span class="sr-only">Actions</span>
												</Button>
											{/snippet}
										</DropdownMenu.Trigger>
										<DropdownMenu.Content align="end">
												<DropdownMenu.Item onclick={() => openRenameSheet(token)}>Rename</DropdownMenu.Item>
												<DropdownMenu.Item onclick={() => (confirmRegenerateId = token.id)}>Regenerate</DropdownMenu.Item>
												<DropdownMenu.Separator />
												<DropdownMenu.Item
													class="text-destructive"
													onclick={() => (confirmRevokeId = token.id)}
												>
													Revoke
												</DropdownMenu.Item>
										</DropdownMenu.Content>
									</DropdownMenu.Root>
								{/if}
								</Table.Cell>
							</Table.Row>
						{/if}
					{/each}
				</Table.Body>
			</Table.Root>
		</div>
	{/if}
</div>
