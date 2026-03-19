<script lang="ts">
import { enhance } from "$app/forms";
import { goto } from "$app/navigation";
import { page } from "$app/state";
import { toast } from "svelte-sonner";
import { Button } from "$lib/components/ui/button/index.js";
import { Badge } from "$lib/components/ui/badge/index.js";
import * as Table from "$lib/components/ui/table/index.js";
import * as Dialog from "$lib/components/ui/dialog/index.js";
import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
import * as Breadcrumb from "$lib/components/ui/breadcrumb/index.js";
import * as Card from "$lib/components/ui/card/index.js";
import { Input } from "$lib/components/ui/input/index.js";
import { Label } from "$lib/components/ui/label/index.js";
import { Checkbox } from "$lib/components/ui/checkbox/index.js";
import PlusIcon from "@lucide/svelte/icons/plus";
import ServerIcon from "@lucide/svelte/icons/server";
import GlobeIcon from "@lucide/svelte/icons/globe";
import MonitorIcon from "@lucide/svelte/icons/monitor";
import CheckIcon from "@lucide/svelte/icons/check";
import CopyIcon from "@lucide/svelte/icons/copy";
import EllipsisIcon from "@lucide/svelte/icons/ellipsis";
import LoaderCircleIcon from "@lucide/svelte/icons/loader-circle";
import EyeIcon from "@lucide/svelte/icons/eye";
import EyeOffIcon from "@lucide/svelte/icons/eye-off";
import type { PageData } from "./$types";

type Target = {
	id: string;
	name: string;
	slug: string;
	type: string;
	baseUrl: string | null;
	enabled: boolean;
	authMethodCount: number;
	createdAt: string | Date;
	updatedAt: string | Date;
};

let { data }: { data: PageData } = $props();

let gatewayUrl = $derived(page.url.origin);
let localTargets = $state<Target[] | null>(null);
let targetList = $derived<Target[]>(localTargets ?? (data.targets as Target[]));
let confirmDeleteId = $state<string | null>(null);

// Create dialog state
let createOpen = $state(false);
let createStep = $state(0);
let createSubmitting = $state(false);
let createdTarget = $state<Target | null>(null);
let authSubmitting = $state(false);
let showCredential = $state(false);
let isDefaultChecked = $state(true);
let copied = $state(false);

function resetCreateState() {
	createStep = 0;
	createSubmitting = false;
	createdTarget = null;
	authSubmitting = false;
	showCredential = false;
	isDefaultChecked = true;
	copied = false;
}

function updateTargetList(updater: (targets: Target[]) => Target[]) {
	localTargets = updater(targetList);
}

function formatDate(dateStr: string): string {
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
</script>

<!-- Multi-step Create Dialog -->
<Dialog.Root bind:open={createOpen} onOpenChange={(open) => { if (!open) resetCreateState(); }}>
	<Dialog.Content class="sm:max-w-lg">
		{#if createStep === 0}
			<Dialog.Header>
				<Dialog.Title>Create Target</Dialog.Title>
				<Dialog.Description>Choose the type of target to create.</Dialog.Description>
			</Dialog.Header>
			<div class="grid grid-cols-2 gap-4 py-4">
				<button
					type="button"
					class="flex flex-col items-center gap-3 rounded-lg border-2 border-transparent bg-muted/50 p-6 text-center transition-colors hover:border-primary hover:bg-muted"
					onclick={() => (createStep = 1)}
				>
					<GlobeIcon class="size-8 text-primary" />
					<div>
						<p class="font-semibold">API</p>
						<p class="text-muted-foreground text-xs">Proxy to an external API</p>
					</div>
				</button>
				<div class="relative flex flex-col items-center gap-3 rounded-lg border-2 border-transparent bg-muted/50 p-6 text-center opacity-50">
					<Badge variant="secondary" class="absolute top-2 right-2 text-[10px]">Coming soon</Badge>
					<MonitorIcon class="size-8 text-muted-foreground" />
					<div>
						<p class="font-semibold">Server</p>
						<p class="text-muted-foreground text-xs">Connect to a server or service</p>
					</div>
				</div>
			</div>
		{:else if createStep === 1}
			<Dialog.Header>
				<Dialog.Title>Target Details</Dialog.Title>
				<Dialog.Description>Enter the name and base URL for your API target.</Dialog.Description>
			</Dialog.Header>
			<form
				method="POST"
				action="?/create"
				use:enhance={() => {
					createSubmitting = true;
					return async ({ result, update }) => {
						createSubmitting = false;
						if (result.type === 'success' && result.data?.created) {
							const created = result.data.created as Target;
							createdTarget = created;
							updateTargetList((targets) => [...targets, created]);
							createStep = 2;
						} else if (result.type === 'failure') {
							toast.error((result.data?.error as string) ?? 'Failed to create target');
						}
						await update({ reset: true, invalidateAll: false });
					};
				}}
			>
				<div class="grid gap-4 py-4">
					<div class="grid gap-2">
						<Label for="create-name">Name</Label>
						<Input id="create-name" name="name" placeholder="e.g. OpenAI API" required />
					</div>
					<div class="grid gap-2">
						<Label for="create-base-url">Base URL</Label>
						<Input id="create-base-url" name="base_url" placeholder="e.g. https://api.openai.com" required />
					</div>
					<div class="flex gap-2">
						<Button variant="outline" type="button" onclick={() => (createStep = 0)}>Back</Button>
						<Button type="submit" class="flex-1" disabled={createSubmitting}>
							{#if createSubmitting}
								<LoaderCircleIcon class="mr-2 size-4 animate-spin" />
							{/if}
							Create Target
						</Button>
					</div>
				</div>
			</form>
		{:else if createStep === 2}
			<Dialog.Header>
				<Dialog.Title>Add Credentials</Dialog.Title>
				<Dialog.Description>Add an auth method for {createdTarget?.name ?? 'your target'}. You can also do this later.</Dialog.Description>
			</Dialog.Header>
			<form
				method="POST"
				action="?/addAuthMethod"
				use:enhance={() => {
					authSubmitting = true;
					return async ({ result, update }) => {
						authSubmitting = false;
						if (result.type === 'success' && result.data?.authMethodAdded) {
							if (createdTarget) {
								updateTargetList((targets) => targets.map((t) =>
									t.id === createdTarget!.id ? { ...t, authMethodCount: t.authMethodCount + 1 } : t
								));
							}
							createStep = 3;
						} else if (result.type === 'failure') {
							toast.error((result.data?.error as string) ?? 'Failed to add auth method');
						}
						await update({ reset: true, invalidateAll: false });
					};
				}}
			>
				<input type="hidden" name="slug" value={createdTarget?.slug ?? ''} />
				<div class="grid gap-4 py-4">
					<div class="grid gap-2">
						<Label for="auth-label">Label</Label>
						<Input id="auth-label" name="label" placeholder="e.g. Production Key" required />
					</div>
					<div class="grid gap-2">
						<Label for="auth-credential">Credential</Label>
						<div class="relative">
							<Input
								id="auth-credential"
								name="credential"
								type={showCredential ? 'text' : 'password'}
								placeholder="e.g. sk-..."
								required
							/>
							<Button
								type="button"
								variant="ghost"
								size="icon"
								class="absolute right-0 top-0 h-full px-3"
								onclick={() => (showCredential = !showCredential)}
							>
								{#if showCredential}
									<EyeOffIcon class="size-4" />
								{:else}
									<EyeIcon class="size-4" />
								{/if}
							</Button>
						</div>
					</div>
					<div class="flex items-center gap-2">
						<Checkbox id="auth-default" name="isDefault" checked={isDefaultChecked} onCheckedChange={(v) => (isDefaultChecked = v === true)} />
						<Label for="auth-default" class="text-sm font-normal">Set as default auth method</Label>
					</div>
					<div class="flex gap-2">
						<Button variant="ghost" type="button" onclick={() => (createStep = 3)}>Skip for now</Button>
						<Button type="submit" class="flex-1" disabled={authSubmitting}>
							{#if authSubmitting}
								<LoaderCircleIcon class="mr-2 size-4 animate-spin" />
							{/if}
							Add Credential
						</Button>
					</div>
				</div>
			</form>
		{:else if createStep === 3}
			<Dialog.Header>
				<Dialog.Title>Target Ready</Dialog.Title>
				<Dialog.Description>Your target is ready!</Dialog.Description>
			</Dialog.Header>
			<div class="flex flex-col items-center gap-4 py-6">
				<div class="flex size-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900">
					<CheckIcon class="size-6 text-green-600 dark:text-green-300" />
				</div>
				<p class="text-center text-sm text-muted-foreground">Your target is ready! You can proxy requests using:</p>
				<div class="w-full rounded-lg border bg-muted/50 p-3">
					<div class="flex items-start justify-between gap-2">
						<pre class="break-all font-mono text-xs whitespace-pre-wrap">{`curl ${gatewayUrl}/gateway/${createdTarget?.slug ?? 'your-target'}/health \
  -H "Authorization: Bearer <your-shellgate-token>"`}</pre>
						<Button
							variant="ghost"
							size="icon"
							class="size-7 shrink-0"
							onclick={() => copyToClipboard(`curl ${gatewayUrl}/gateway/${createdTarget?.slug ?? 'your-target'}/health \\\n  -H "Authorization: Bearer <your-shellgate-token>"`)}
						>
							{#if copied}
								<CheckIcon class="size-3.5" />
							{:else}
								<CopyIcon class="size-3.5" />
							{/if}
						</Button>
					</div>
				</div>
				<p class="text-muted-foreground text-xs">Replace <code class="font-mono">/health</code> with any path your target API supports.</p>
			</div>
			<Dialog.Footer>
				<Button class="w-full" onclick={() => (createOpen = false)}>Done</Button>
			</Dialog.Footer>
		{/if}
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
						<Breadcrumb.Page>Targets</Breadcrumb.Page>
					</Breadcrumb.Item>
				</Breadcrumb.List>
			</Breadcrumb.Root>
			<h1 class="mt-1 text-2xl font-bold tracking-tight">Targets</h1>
		</div>
		{#if targetList.length > 0}
			<Button onclick={() => (createOpen = true)}>
				<PlusIcon class="mr-2 size-4" />
				Create Target
			</Button>
		{/if}
	</div>

	{#if targetList.length === 0}
		<div class="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed py-16">
			<div class="bg-muted flex size-12 items-center justify-center rounded-full">
				<ServerIcon class="text-muted-foreground size-6" />
			</div>
			<div class="text-center">
				<h2 class="text-lg font-semibold">No targets yet</h2>
				<p class="text-muted-foreground mt-1 text-sm">
					Create your first target to start proxying requests.
				</p>
			</div>
			<Button onclick={() => (createOpen = true)}>
				<PlusIcon class="mr-2 size-4" />
				Create Target
			</Button>
		</div>
	{:else}
		<div class="rounded-lg border">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>Name</Table.Head>
						<Table.Head>Type</Table.Head>
						<Table.Head>Endpoint</Table.Head>
						<Table.Head>Auth Methods</Table.Head>
						<Table.Head>Status</Table.Head>
						<Table.Head class="w-12"><span class="sr-only">Actions</span></Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each targetList as target (target.id)}
						{#if confirmDeleteId === target.id}
							<Table.Row class="bg-red-50 dark:bg-red-950/30">
								<Table.Cell colspan={6}>
									<div class="flex items-center justify-between gap-4 py-1">
										<p class="text-sm">
											Delete this target? This action cannot be undone.
										</p>
										<div class="flex shrink-0 gap-2">
											<Button variant="outline" size="sm" onclick={() => (confirmDeleteId = null)}>Cancel</Button>
											<form
												method="POST"
												action="?/delete"
												use:enhance={() => {
													return async ({ result, update }) => {
														if (result.type === 'success' && result.data?.deleted) {
															const deletedId = result.data.deleted as string;
															updateTargetList((targets) => targets.filter((t) => t.id !== deletedId));
															confirmDeleteId = null;
															toast.success('Target deleted');
														} else if (result.type === 'failure') {
															toast.error((result.data?.error as string) ?? 'Failed to delete target');
														}
														await update({ reset: false, invalidateAll: false });
													};
												}}
											>
												<input type="hidden" name="id" value={target.id} />
												<Button type="submit" variant="destructive" size="sm">Yes, delete</Button>
											</form>
										</div>
									</div>
								</Table.Cell>
							</Table.Row>
						{:else}
							<Table.Row>
								<Table.Cell class="font-medium">
									<a href="/targets/{target.slug}" class="hover:underline">{target.name}</a>
								</Table.Cell>
								<Table.Cell>
									<Badge variant="outline">{target.type}</Badge>
								</Table.Cell>
								<Table.Cell>
									{#if target.baseUrl}
										<code class="text-muted-foreground text-xs font-mono">{target.baseUrl}</code>
									{:else}
										<span class="text-muted-foreground">&mdash;</span>
									{/if}
								</Table.Cell>
								<Table.Cell class="text-muted-foreground text-sm">{target.authMethodCount}</Table.Cell>
								<Table.Cell>
									{#if target.enabled !== false}
										<Badge class="border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300">Active</Badge>
									{:else}
										<Badge variant="secondary">Disabled</Badge>
									{/if}
								</Table.Cell>
								<Table.Cell>
									<form
										method="POST"
										action="?/toggle"
										class="hidden"
										id="toggle-form-{target.id}"
										use:enhance={() => {
											return async ({ result, update }) => {
												if (result.type === 'success' && result.data?.toggled) {
													const { id, enabled } = result.data.toggled as { id: string; enabled: boolean };
													updateTargetList((targets) => targets.map((t) => (t.id === id ? { ...t, enabled } : t)));
													toast.success(enabled ? 'Target enabled' : 'Target disabled');
												} else if (result.type === 'failure') {
													toast.error((result.data?.error as string) ?? 'Failed to toggle');
												}
												await update({ reset: false, invalidateAll: false });
											};
										}}
									>
										<input type="hidden" name="id" value={target.id} />
										<input type="hidden" name="enabled" value={target.enabled !== false ? 'false' : 'true'} />
									</form>
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
											<DropdownMenu.Item onclick={() => goto(`/targets/${target.slug}`)}>Edit</DropdownMenu.Item>
											<DropdownMenu.Item
												onclick={() => {
													(document.getElementById(`toggle-form-${target.id}`) as HTMLFormElement)?.requestSubmit();
												}}
											>
												{target.enabled !== false ? 'Disable' : 'Enable'}
											</DropdownMenu.Item>
											<DropdownMenu.Separator />
											<DropdownMenu.Item
												class="text-destructive"
												onclick={() => (confirmDeleteId = target.id)}
											>
												Delete
											</DropdownMenu.Item>
										</DropdownMenu.Content>
									</DropdownMenu.Root>
								</Table.Cell>
							</Table.Row>
						{/if}
					{/each}
				</Table.Body>
			</Table.Root>
		</div>
	{/if}
</div>
