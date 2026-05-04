<script lang="ts">
	import { enhance } from "$app/forms";
	import { goto } from "$app/navigation";
	import { toast } from "svelte-sonner";
	import { Button } from "$lib/components/ui/button/index.js";
	import { Badge } from "$lib/components/ui/badge/index.js";
	import * as Dialog from "$lib/components/ui/dialog/index.js";
	import * as Breadcrumb from "$lib/components/ui/breadcrumb/index.js";
	import type { PageData } from "./$types";

	let { data }: { data: PageData } = $props();

	let content = $state(data.skill.contentMd);
	let saving = $state(false);
	let deleteOpen = $state(false);
	let deleteSubmitting = $state(false);
	let version = $state(data.skill.version);
	let isBuiltIn = $derived('builtIn' in data.skill && data.skill.builtIn === true);

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
					<Breadcrumb.Link href="/skills">Skills</Breadcrumb.Link>
				</Breadcrumb.Item>
				<Breadcrumb.Separator />
				<Breadcrumb.Item>
					<Breadcrumb.Page>{data.skill.slug}</Breadcrumb.Page>
				</Breadcrumb.Item>
			</Breadcrumb.List>
		</Breadcrumb.Root>
		<div class="mt-1 flex items-center gap-3">
			<h1 class="text-2xl font-bold tracking-tight font-mono">{data.skill.slug}</h1>
			<Badge variant="secondary">v{version}</Badge>
			{#if isBuiltIn}
				<Badge class="border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300">built-in</Badge>
			{/if}
		</div>
	</div>

	<!-- Metadata -->
	<div class="rounded-lg border p-6">
		<h2 class="mb-4 text-lg font-semibold">Details</h2>
		<dl class="grid gap-4 sm:grid-cols-3">
			<div>
				<dt class="text-muted-foreground mb-1 text-sm">Description</dt>
				<dd class="text-sm">{data.skill.description}</dd>
			</div>
			{#if !isBuiltIn}
				<div>
					<dt class="text-muted-foreground mb-1 text-sm">Created</dt>
					<dd class="text-sm">{formatDate(data.skill.createdAt)}</dd>
				</div>
				<div>
					<dt class="text-muted-foreground mb-1 text-sm">Updated</dt>
					<dd class="text-sm">{formatDate(data.skill.updatedAt)}</dd>
				</div>
			{/if}
		</dl>
	</div>

	<!-- Content -->
	{#if isBuiltIn}
		<div class="rounded-lg border p-6">
			<h2 class="mb-2 text-lg font-semibold">Content</h2>
			<p class="text-muted-foreground mb-4 text-sm">
				This is a built-in skill and cannot be edited.
			</p>
			<div class="bg-muted/50 rounded-md p-4 font-mono text-sm whitespace-pre-wrap">{content}</div>
		</div>
	{:else}
		<div class="rounded-lg border p-6">
			<h2 class="mb-2 text-lg font-semibold">SKILL.md Content</h2>
			<p class="text-muted-foreground mb-4 text-sm">
				Edit the full SKILL.md content including YAML frontmatter. The name in frontmatter must match the current slug.
			</p>
			<form
				method="POST"
				action="?/update"
				use:enhance={() => {
					saving = true;
					return async ({ result, update }) => {
						saving = false;
						if (result.type === "success" && result.data?.updated) {
							const updated = result.data.updated as typeof data.skill;
							content = updated.contentMd;
							version = updated.version;
							data.skill.description = updated.description;
							data.skill.updatedAt = updated.updatedAt;
							toast.success("Skill updated");
						} else if (result.type === "failure") {
							toast.error((result.data?.error as string) ?? "Failed to update");
						}
						await update({ reset: false, invalidateAll: false });
					};
				}}
			>
				<textarea
					name="content"
					bind:value={content}
					class="border-input bg-background placeholder:text-muted-foreground flex min-h-[300px] w-full rounded-md border px-3 py-2 font-mono text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
					rows="15"
				></textarea>
				<div class="mt-3">
					<Button type="submit" disabled={saving}>
						{saving ? "Saving..." : "Save"}
					</Button>
				</div>
			</form>
		</div>

		<!-- Danger Zone -->
		<div class="rounded-lg border border-destructive/50 p-6">
			<h2 class="mb-2 text-lg font-semibold text-destructive">Danger Zone</h2>
			<p class="text-muted-foreground mb-4 text-sm">Permanently delete this skill. This action cannot be undone.</p>
			<Button variant="destructive" onclick={() => { deleteOpen = true; }}>Delete Skill</Button>
		</div>
	{/if}
</div>

<!-- Delete Confirmation Dialog -->
<Dialog.Root bind:open={deleteOpen}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Delete Skill</Dialog.Title>
			<Dialog.Description>
				This will permanently delete <strong>{data.skill.slug}</strong>. This action cannot be undone.
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
						toast.success("Skill deleted");
						goto("/skills");
					} else if (result.type === "failure") {
						toast.error((result.data?.error as string) ?? "Failed to delete");
					}
					await update({ reset: false, invalidateAll: false });
				};
			}}
		>
			<Dialog.Footer>
				<Button variant="outline" onclick={() => { deleteOpen = false; }}>Cancel</Button>
				<Button type="submit" variant="destructive" disabled={deleteSubmitting}>
					{deleteSubmitting ? "Deleting..." : "Delete"}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
