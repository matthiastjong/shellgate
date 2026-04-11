<script lang="ts">
	import { enhance } from "$app/forms";
	import { page } from "$app/state";
	import * as Table from "$lib/components/ui/table/index.js";
	import * as Dialog from "$lib/components/ui/dialog/index.js";
	import * as Select from "$lib/components/ui/select/index.js";
	import { Button } from "$lib/components/ui/button/index.js";
	import { Input } from "$lib/components/ui/input/index.js";
	import { Label } from "$lib/components/ui/label/index.js";
	import { Badge } from "$lib/components/ui/badge/index.js";
	import * as Breadcrumb from "$lib/components/ui/breadcrumb/index.js";
	import CopyIcon from "@lucide/svelte/icons/copy";
	import TrashIcon from "@lucide/svelte/icons/trash-2";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import FileTextIcon from "@lucide/svelte/icons/file-text";
	import { toast } from "svelte-sonner";

	let { data } = $props();

	type Endpoint = (typeof data.endpoints)[number];

	let localEndpoints = $state<Endpoint[] | null>(null);
	let endpoints = $derived(localEndpoints ?? data.endpoints);

	let createOpen = $state(false);
	let createSubmitting = $state(false);
	let deleteOpen = $state(false);
	let deleteTarget = $state<Endpoint | null>(null);
	let deleteSubmitting = $state(false);
	let selectedTokenId = $state("");

	function webhookUrl(slug: string) {
		return `${page.url.origin}/webhooks/incoming/${slug}`;
	}

	function copyToClipboard(text: string) {
		navigator.clipboard.writeText(text);
		toast.success("Copied to clipboard");
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
					<Breadcrumb.Page>Webhooks</Breadcrumb.Page>
				</Breadcrumb.Item>
			</Breadcrumb.List>
		</Breadcrumb.Root>
		<h1 class="mt-1 text-2xl font-bold tracking-tight">Webhooks</h1>
		<p class="text-muted-foreground text-sm">Receive incoming webhooks from external services.</p>
	</div>

	<div class="flex justify-end">
		<Button onclick={() => { createOpen = true; selectedTokenId = ""; }}>
			<PlusIcon class="mr-2 size-4" />
			New Webhook
		</Button>
	</div>

	{#if endpoints.length === 0}
		<div class="text-muted-foreground flex flex-col items-center justify-center rounded-lg border border-dashed py-12">
			<p class="text-sm">No webhook endpoints yet.</p>
			<Button variant="link" onclick={() => { createOpen = true; }}>Create your first webhook</Button>
		</div>
	{:else}
		<div class="rounded-lg border">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>Name</Table.Head>
						<Table.Head>API Key</Table.Head>
						<Table.Head>Pending</Table.Head>
						<Table.Head>Created</Table.Head>
						<Table.Head class="w-[100px]"></Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each endpoints as endpoint (endpoint.id)}
						<Table.Row>
							<Table.Cell>
								<div class="flex items-center gap-1.5">
									<a href="/webhooks/{endpoint.id}" class="font-medium hover:underline">{endpoint.name}</a>
									{#if endpoint.handlingInstructions}
										<span class="text-muted-foreground" title="Has handling instructions">
											<FileTextIcon class="size-3.5" />
										</span>
									{/if}
								</div>
								<button
									class="text-muted-foreground ml-2 inline-flex items-center text-xs hover:text-foreground"
									onclick={() => copyToClipboard(webhookUrl(endpoint.slug))}
								>
									<CopyIcon class="mr-1 size-3" />
									Copy URL
								</button>
							</Table.Cell>
							<Table.Cell class="text-muted-foreground text-sm">{endpoint.tokenName ?? "—"}</Table.Cell>
							<Table.Cell>
								{#if endpoint.pendingCount > 0}
									<Badge variant="default">{endpoint.pendingCount}</Badge>
								{:else}
									<span class="text-muted-foreground text-sm">0</span>
								{/if}
							</Table.Cell>
							<Table.Cell class="text-muted-foreground text-sm">{formatDate(endpoint.createdAt)}</Table.Cell>
							<Table.Cell>
								<Button
									variant="ghost"
									size="icon"
									onclick={() => { deleteTarget = endpoint; deleteOpen = true; }}
								>
									<TrashIcon class="size-4" />
								</Button>
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</div>
	{/if}
</div>

<!-- Create Dialog -->
<Dialog.Root bind:open={createOpen} onOpenChange={(open) => { if (!open) { selectedTokenId = ""; } }}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>New Webhook Endpoint</Dialog.Title>
			<Dialog.Description>Create an endpoint to receive webhooks from an external service.</Dialog.Description>
		</Dialog.Header>
		<form
			method="POST"
			action="?/create"
			use:enhance={() => {
				createSubmitting = true;
				return async ({ result, update }) => {
					createSubmitting = false;
					if (result.type === "success" && result.data?.created) {
						const created = result.data.created as Endpoint;
						localEndpoints = [{ ...created, tokenName: data.tokens.find((t) => t.id === created.tokenId)?.name ?? null, pendingCount: 0 }, ...endpoints];
						createOpen = false;
						toast.success("Webhook endpoint created");
					} else if (result.type === "failure") {
						toast.error((result.data?.error as string) ?? "Failed to create");
					}
					await update({ reset: false, invalidateAll: false });
				};
			}}
		>
			<div class="space-y-4 py-4">
				<div class="space-y-2">
					<Label for="name">Name</Label>
					<Input id="name" name="name" placeholder="e.g. Linear webhook" required />
				</div>
				<div class="space-y-2">
					<Label for="tokenId">API Key</Label>
					<input type="hidden" name="tokenId" value={selectedTokenId} />
					<Select.Root type="single" bind:value={selectedTokenId}>
						<Select.Trigger id="tokenId" class="w-full">
							{data.tokens.find((t) => t.id === selectedTokenId)?.name ?? "Select an API key..."}
						</Select.Trigger>
						<Select.Content>
							{#each data.tokens.filter((t) => !t.revokedAt) as token (token.id)}
								<Select.Item value={token.id}>{token.name}</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
				</div>
				<div class="space-y-2">
					<Label for="secret">Secret <span class="text-muted-foreground">(optional)</span></Label>
					<Input id="secret" name="secret" type="password" placeholder="HMAC secret for signature verification" />
				</div>
				<div class="space-y-2">
					<Label for="signatureHeader">Signature Header <span class="text-muted-foreground">(optional)</span></Label>
					<Input id="signatureHeader" name="signatureHeader" placeholder="e.g. X-Hub-Signature-256" />
				</div>
			</div>
			<Dialog.Footer>
				<Button variant="outline" onclick={() => { createOpen = false; }}>Cancel</Button>
				<Button type="submit" disabled={createSubmitting}>
					{createSubmitting ? "Creating..." : "Create"}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>

<!-- Delete Confirmation Dialog -->
<Dialog.Root bind:open={deleteOpen} onOpenChange={(open) => { if (!open) deleteTarget = null; }}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Delete Webhook</Dialog.Title>
			<Dialog.Description>
				This will permanently delete <strong>{deleteTarget?.name}</strong> and all its stored events. This action cannot be undone.
			</Dialog.Description>
		</Dialog.Header>
		<form
			method="POST"
			action="?/delete"
			use:enhance={() => {
				deleteSubmitting = true;
				return async ({ result, update }) => {
					deleteSubmitting = false;
					if (result.type === "success" && result.data?.deleted) {
						localEndpoints = endpoints.filter((e) => e.id !== result.data?.deleted);
						deleteOpen = false;
						toast.success("Webhook deleted");
					} else if (result.type === "failure") {
						toast.error((result.data?.error as string) ?? "Failed to delete");
					}
					await update({ reset: false, invalidateAll: false });
				};
			}}
		>
			<input type="hidden" name="id" value={deleteTarget?.id ?? ""} />
			<Dialog.Footer>
				<Button variant="outline" onclick={() => { deleteOpen = false; }}>Cancel</Button>
				<Button type="submit" variant="destructive" disabled={deleteSubmitting}>
					{deleteSubmitting ? "Deleting..." : "Delete"}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
