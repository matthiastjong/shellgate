<script lang="ts">
	import { enhance } from "$app/forms";
	import * as Breadcrumb from "$lib/components/ui/breadcrumb/index.js";
	import * as Dialog from "$lib/components/ui/dialog/index.js";
	import { Button } from "$lib/components/ui/button/index.js";
	import { Input } from "$lib/components/ui/input/index.js";
	import { Label } from "$lib/components/ui/label/index.js";
	import { Badge } from "$lib/components/ui/badge/index.js";
	import { Switch } from "$lib/components/ui/switch/index.js";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import TrashIcon from "@lucide/svelte/icons/trash-2";
	import EyeIcon from "@lucide/svelte/icons/eye";
	import EyeOffIcon from "@lucide/svelte/icons/eye-off";
	import CopyIcon from "@lucide/svelte/icons/copy";
	import PencilIcon from "@lucide/svelte/icons/pencil";
	import CheckIcon from "@lucide/svelte/icons/check";
	import XIcon from "@lucide/svelte/icons/x";
	import { toast } from "svelte-sonner";

	let { data } = $props();

	type Field = (typeof data.item.fields)[number];

	let localFields = $state<Field[] | null>(null);
	let fields = $derived(localFields ?? data.item.fields);

	// Revealed sensitive values: fieldId -> plaintext
	let revealedValues = $state<Record<string, string>>({});
	// Auto-hide timers: fieldId -> timeout handle
	let revealTimers: Record<string, ReturnType<typeof setTimeout>> = {};

	// Inline edit state
	let editingField = $state<string | null>(null);
	let editValue = $state("");
	let editSubmitting = $state(false);

	// Add field dialog
	let addFieldOpen = $state(false);
	let addFieldSubmitting = $state(false);
	let addFieldSensitive = $state(true);

	// Delete field dialog
	let deleteFieldOpen = $state(false);
	let deleteFieldTarget = $state<Field | null>(null);
	let deleteFieldSubmitting = $state(false);

	// Details edit state
	let detailsSaving = $state(false);
	let editDomain = $state(data.item.domain ?? "");
	let editDescription = $state(data.item.description ?? "");

	function hideRevealed(id: string) {
		revealedValues = Object.fromEntries(Object.entries(revealedValues).filter(([k]) => k !== id));
		if (revealTimers[id]) {
			clearTimeout(revealTimers[id]);
			delete revealTimers[id];
		}
	}

	function scheduleHide(id: string, ms: number) {
		if (revealTimers[id]) clearTimeout(revealTimers[id]);
		revealTimers[id] = setTimeout(() => hideRevealed(id), ms);
	}

	function startEditField(field: Field) {
		editingField = field.id;
		editValue = revealedValues[field.id] ?? (field.value ?? "");
	}

	function cancelEditField() {
		editingField = null;
		editValue = "";
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
					<Breadcrumb.Link href="/vaults">Vaults</Breadcrumb.Link>
				</Breadcrumb.Item>
				<Breadcrumb.Separator />
				<Breadcrumb.Item>
					<Breadcrumb.Link href="/vaults/{data.vault.slug}">{data.vault.name}</Breadcrumb.Link>
				</Breadcrumb.Item>
				<Breadcrumb.Separator />
				<Breadcrumb.Item>
					<Breadcrumb.Page>{data.item.name}</Breadcrumb.Page>
				</Breadcrumb.Item>
			</Breadcrumb.List>
		</Breadcrumb.Root>
		<h1 class="mt-1 text-2xl font-bold tracking-tight">{data.item.name}</h1>
		<p class="text-muted-foreground font-mono text-sm">{data.vault.slug}/{data.item.slug}</p>
	</div>

	<!-- Details Section -->
	<div class="rounded-lg border p-6">
		<h2 class="mb-4 text-lg font-semibold">Details</h2>
		<form
			method="POST"
			action="?/updateItem"
			use:enhance={() => {
				detailsSaving = true;
				return async ({ result, update }) => {
					detailsSaving = false;
					if (result.type === "success" && result.data?.updated) {
						data.item.domain = editDomain.trim() || null;
						data.item.description = editDescription.trim() || null;
						toast.success("Details saved");
					} else if (result.type === "failure") {
						toast.error((result.data?.error as string) ?? "Failed to save");
					}
					await update({ reset: false, invalidateAll: false });
				};
			}}
		>
			<div class="grid gap-4 sm:grid-cols-2">
				<div>
					<Label for="domain">Domain</Label>
					<Input
						id="domain"
						name="domain"
						class="mt-1"
						bind:value={editDomain}
						placeholder="e.g. github.com"
					/>
				</div>
				<div>
					<Label for="description">Description</Label>
					<Input
						id="description"
						name="description"
						class="mt-1"
						bind:value={editDescription}
						placeholder="What this item is for"
					/>
				</div>
			</div>
			{#if data.item.allowedOrigins?.length}
				<div class="mt-3">
					<p class="text-muted-foreground mb-1 text-sm font-medium">Allowed Origins</p>
					<div class="flex flex-wrap gap-1">
						{#each data.item.allowedOrigins as origin (origin)}
							<Badge variant="secondary" class="font-mono text-xs">{origin}</Badge>
						{/each}
					</div>
				</div>
			{/if}
			<div class="mt-4">
				<Button type="submit" disabled={detailsSaving}>
					{detailsSaving ? "Saving..." : "Save"}
				</Button>
			</div>
		</form>
	</div>

	<!-- Fields Section -->
	<div class="rounded-lg border p-6">
		<div class="mb-4 flex items-center justify-between">
			<h2 class="text-lg font-semibold">Fields</h2>
			<Button size="sm" onclick={() => { addFieldOpen = true; addFieldSensitive = true; }}>
				<PlusIcon class="mr-2 size-4" />
				Add Field
			</Button>
		</div>

		{#if fields.length === 0}
			<div class="text-muted-foreground flex flex-col items-center justify-center rounded-lg border border-dashed py-8">
				<p class="text-sm">No fields yet.</p>
				<Button variant="link" onclick={() => { addFieldOpen = true; }}>Add your first field</Button>
			</div>
		{:else}
			<div class="divide-y">
				{#each fields as field (field.id)}
					<div class="py-4 first:pt-0 last:pb-0">
						<div class="flex items-start justify-between gap-4">
							<div class="min-w-0 flex-1">
								<div class="mb-1 flex items-center gap-2">
									<span class="text-sm font-medium">{field.name}</span>
									{#if field.sensitive}
										<Badge variant="secondary" class="text-xs">sensitive</Badge>
									{/if}
								</div>

								{#if editingField === field.id}
									<!-- Inline edit form -->
									<form
										method="POST"
										action="?/updateField"
										use:enhance={() => {
											editSubmitting = true;
											return async ({ result, update }) => {
												editSubmitting = false;
												if (result.type === "success" && result.data?.updatedField) {
													// Update local field value display
													if (!field.sensitive) {
														localFields = fields.map((f) =>
															f.id === field.id ? { ...f, value: editValue } : f
														);
													} else {
														// Update revealed value if we edited a sensitive field
														revealedValues = { ...revealedValues, [field.id]: editValue };
														scheduleHide(field.id, 10000);
													}
													cancelEditField();
													toast.success("Field updated");
												} else if (result.type === "failure") {
													toast.error((result.data?.error as string) ?? "Failed to update");
												}
												await update({ reset: false, invalidateAll: false });
											};
										}}
									>
										<input type="hidden" name="id" value={field.id} />
										<div class="flex items-center gap-2">
											<Input
												type="password"
												name="value"
												bind:value={editValue}
												class="h-8 font-mono text-sm"
												placeholder="New value"
												required
											/>
											<Button type="submit" size="icon" class="size-8 shrink-0" disabled={editSubmitting}>
												<CheckIcon class="size-4" />
											</Button>
											<Button type="button" size="icon" variant="ghost" class="size-8 shrink-0" onclick={cancelEditField}>
												<XIcon class="size-4" />
											</Button>
										</div>
									</form>
								{:else}
									<!-- Value display -->
									<div class="flex items-center gap-2">
										<code class="text-muted-foreground truncate font-mono text-sm">
											{#if field.sensitive}
												{#if revealedValues[field.id]}
													{revealedValues[field.id]}
												{:else}
													••••••••••••
												{/if}
											{:else}
												{field.value ?? ""}
											{/if}
										</code>
									</div>
								{/if}
							</div>

							<!-- Action buttons -->
							{#if editingField !== field.id}
								<div class="flex shrink-0 items-center gap-1">
									{#if field.sensitive}
										<!-- Eye toggle for sensitive fields -->
										<form
											method="POST"
											action="?/revealField"
											use:enhance={() => {
												return async ({ result, update }) => {
													if (result.type === "success" && result.data?.revealedField) {
														const { id, value } = result.data.revealedField as { id: string; value: string };
														if (revealedValues[id]) {
															hideRevealed(id);
														} else {
															revealedValues = { ...revealedValues, [id]: value };
															scheduleHide(id, 10000);
														}
													} else if (result.type === "failure") {
														toast.error((result.data?.error as string) ?? "Failed to reveal");
													}
													await update({ reset: false, invalidateAll: false });
												};
											}}
										>
											<input type="hidden" name="id" value={field.id} />
											<Button type="submit" variant="ghost" size="icon" class="size-8">
												{#if revealedValues[field.id]}
													<EyeOffIcon class="size-4" />
												{:else}
													<EyeIcon class="size-4" />
												{/if}
											</Button>
										</form>
									{/if}

									<!-- Copy button -->
									<form
										method="POST"
										action="?/revealField"
										use:enhance={() => {
											return async ({ result, update }) => {
												if (result.type === "success" && result.data?.revealedField) {
													const { id, value } = result.data.revealedField as { id: string; value: string };
													navigator.clipboard.writeText(value);
													toast.success("Copied to clipboard");
													if (field.sensitive) {
														revealedValues = { ...revealedValues, [id]: value };
														scheduleHide(id, 30000);
													}
												} else if (result.type === "failure") {
													toast.error((result.data?.error as string) ?? "Failed to copy");
												}
												await update({ reset: false, invalidateAll: false });
											};
										}}
									>
										<input type="hidden" name="id" value={field.id} />
										<Button type="submit" variant="ghost" size="icon" class="size-8" onclick={(e) => {
											// For non-sensitive fields, copy directly without form submission
											if (!field.sensitive) {
												e.preventDefault();
												navigator.clipboard.writeText(field.value ?? "");
												toast.success("Copied to clipboard");
											}
										}}>
											<CopyIcon class="size-4" />
										</Button>
									</form>

									<!-- Edit button -->
									<Button
										variant="ghost"
										size="icon"
										class="size-8"
										onclick={() => startEditField(field)}
									>
										<PencilIcon class="size-4" />
									</Button>

									<!-- Delete button -->
									<Button
										variant="ghost"
										size="icon"
										class="size-8"
										onclick={() => { deleteFieldTarget = field; deleteFieldOpen = true; }}
									>
										<TrashIcon class="size-4" />
									</Button>
								</div>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>

<!-- Add Field Dialog -->
<Dialog.Root bind:open={addFieldOpen} onOpenChange={(open) => { if (!open) addFieldSensitive = true; }}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Add Field</Dialog.Title>
			<Dialog.Description>Add a new secret or credential field to this item.</Dialog.Description>
		</Dialog.Header>
		<form
			method="POST"
			action="?/addField"
			use:enhance={() => {
				addFieldSubmitting = true;
				return async ({ result, update }) => {
					addFieldSubmitting = false;
					if (result.type === "success" && result.data?.addedField) {
						const added = result.data.addedField as Field;
						localFields = [...fields, added];
						addFieldOpen = false;
						toast.success("Field added");
					} else if (result.type === "failure") {
						toast.error((result.data?.error as string) ?? "Failed to add field");
					}
					await update({ reset: false, invalidateAll: false });
				};
			}}
		>
			<div class="space-y-4 py-4">
				<div class="space-y-2">
					<Label for="fieldName">Name</Label>
					<Input id="fieldName" name="name" placeholder="e.g. API Key" required />
				</div>
				<div class="space-y-2">
					<Label for="fieldValue">Value</Label>
					<Input id="fieldValue" name="value" type="password" placeholder="Secret value" required />
				</div>
				<div class="flex items-center gap-3">
					<input type="hidden" name="sensitive" value={addFieldSensitive ? "true" : "false"} />
					<Switch
						id="fieldSensitive"
						bind:checked={addFieldSensitive}
					/>
					<Label for="fieldSensitive">Sensitive (mask value)</Label>
				</div>
			</div>
			<Dialog.Footer>
				<Button variant="outline" onclick={() => { addFieldOpen = false; }}>Cancel</Button>
				<Button type="submit" disabled={addFieldSubmitting}>
					{addFieldSubmitting ? "Adding..." : "Add Field"}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>

<!-- Delete Field Confirmation Dialog -->
<Dialog.Root bind:open={deleteFieldOpen} onOpenChange={(open) => { if (!open) deleteFieldTarget = null; }}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Delete Field</Dialog.Title>
			<Dialog.Description>
				This will permanently delete the field <strong>{deleteFieldTarget?.name}</strong> and its stored value. This action cannot be undone.
			</Dialog.Description>
		</Dialog.Header>
		<form
			method="POST"
			action="?/deleteField"
			use:enhance={() => {
				deleteFieldSubmitting = true;
				return async ({ result, update }) => {
					deleteFieldSubmitting = false;
					if (result.type === "success" && result.data?.deletedField) {
						localFields = fields.filter((f) => f.id !== result.data?.deletedField);
						if (deleteFieldTarget) hideRevealed(deleteFieldTarget.id);
						deleteFieldOpen = false;
						toast.success("Field deleted");
					} else if (result.type === "failure") {
						toast.error((result.data?.error as string) ?? "Failed to delete");
					}
					await update({ reset: false, invalidateAll: false });
				};
			}}
		>
			<input type="hidden" name="id" value={deleteFieldTarget?.id ?? ""} />
			<Dialog.Footer>
				<Button variant="outline" onclick={() => { deleteFieldOpen = false; }}>Cancel</Button>
				<Button type="submit" variant="destructive" disabled={deleteFieldSubmitting}>
					{deleteFieldSubmitting ? "Deleting..." : "Delete"}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
