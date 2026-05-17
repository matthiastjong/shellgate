<script lang="ts">
	import { enhance } from "$app/forms";
	import * as Table from "$lib/components/ui/table/index.js";
	import * as Dialog from "$lib/components/ui/dialog/index.js";
	import * as Breadcrumb from "$lib/components/ui/breadcrumb/index.js";
	import { Button } from "$lib/components/ui/button/index.js";
	import { Input } from "$lib/components/ui/input/index.js";
	import { Label } from "$lib/components/ui/label/index.js";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import BlindFillGuide from "./BlindFillGuide.svelte";
	import TrashIcon from "@lucide/svelte/icons/trash-2";
	import KeyRoundIcon from "@lucide/svelte/icons/key-round";
	import { toast } from "svelte-sonner";

	let { data } = $props();

	type Vault = (typeof data.vaults)[number];

	let localVaults = $state<Vault[] | null>(null);
	let vaults = $derived(localVaults ?? data.vaults);

	let createOpen = $state(false);
	let createSubmitting = $state(false);
	let deleteOpen = $state(false);
	let deleteTarget = $state<Vault | null>(null);
	let deleteSubmitting = $state(false);

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
					<Breadcrumb.Page>Vaults</Breadcrumb.Page>
				</Breadcrumb.Item>
			</Breadcrumb.List>
		</Breadcrumb.Root>
		<h1 class="mt-1 text-2xl font-bold tracking-tight">Vaults</h1>
		<p class="text-muted-foreground text-sm">Store and manage secrets and credentials for your agents.</p>
	</div>

	<div class="flex justify-end gap-2">
		<BlindFillGuide />
		<Button onclick={() => { createOpen = true; }}>
			<PlusIcon class="mr-2 size-4" />
			New Vault
		</Button>
	</div>

	{#if vaults.length === 0}
		<div class="text-muted-foreground flex flex-col items-center justify-center rounded-lg border border-dashed py-12">
			<p class="text-sm">No vaults yet.</p>
			<Button variant="link" onclick={() => { createOpen = true; }}>Create your first vault</Button>
		</div>
	{:else}
		<div class="rounded-lg border">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>Name</Table.Head>
						<Table.Head>Description</Table.Head>
						<Table.Head>Created</Table.Head>
						<Table.Head class="w-[100px]"></Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each vaults as vault (vault.id)}
						<Table.Row>
							<Table.Cell>
								<div class="flex items-center gap-2">
									<KeyRoundIcon class="text-muted-foreground size-4" />
									<a href="/vaults/{vault.slug}" class="font-medium hover:underline">{vault.name}</a>
								</div>
							</Table.Cell>
							<Table.Cell class="text-muted-foreground text-sm">{vault.description ?? "—"}</Table.Cell>
							<Table.Cell class="text-muted-foreground text-sm">{formatDate(vault.createdAt)}</Table.Cell>
							<Table.Cell>
								<Button
									variant="ghost"
									size="icon"
									onclick={() => { deleteTarget = vault; deleteOpen = true; }}
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
<Dialog.Root bind:open={createOpen}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>New Vault</Dialog.Title>
			<Dialog.Description>Create a vault to store secrets and credentials.</Dialog.Description>
		</Dialog.Header>
		<form
			method="POST"
			action="?/create"
			use:enhance={() => {
				createSubmitting = true;
				return async ({ result, update }) => {
					createSubmitting = false;
					if (result.type === "success" && result.data?.created) {
						const created = result.data.created as Vault;
						localVaults = [created, ...vaults];
						createOpen = false;
						toast.success("Vault created");
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
					<Input id="name" name="name" placeholder="e.g. Production Secrets" required />
				</div>
				<div class="space-y-2">
					<Label for="description">Description <span class="text-muted-foreground">(optional)</span></Label>
					<Input id="description" name="description" placeholder="What this vault is for" />
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
			<Dialog.Title>Delete Vault</Dialog.Title>
			<Dialog.Description>
				This will permanently delete <strong>{deleteTarget?.name}</strong> and all its items and secrets. This action cannot be undone.
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
						localVaults = vaults.filter((v) => v.id !== result.data?.deleted);
						deleteOpen = false;
						toast.success("Vault deleted");
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
