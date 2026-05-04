<script lang="ts">
	import { enhance } from "$app/forms";
	import * as Table from "$lib/components/ui/table/index.js";
	import * as Dialog from "$lib/components/ui/dialog/index.js";
	import { Button } from "$lib/components/ui/button/index.js";
	import { Label } from "$lib/components/ui/label/index.js";
	import * as Breadcrumb from "$lib/components/ui/breadcrumb/index.js";
	import { Badge } from "$lib/components/ui/badge/index.js";
	import TrashIcon from "@lucide/svelte/icons/trash-2";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import { toast } from "svelte-sonner";

	let { data } = $props();

	type SkillEntry = { slug: string; description: string; builtIn: boolean };

	let localSkills = $state<SkillEntry[] | null>(null);
	let skills = $derived(localSkills ?? data.skills);

	let createOpen = $state(false);
	let createSubmitting = $state(false);
	let createContent = $state("");
	let deleteOpen = $state(false);
	let deleteTarget = $state<SkillEntry | null>(null);
	let deleteSubmitting = $state(false);
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
					<Breadcrumb.Page>Skills</Breadcrumb.Page>
				</Breadcrumb.Item>
			</Breadcrumb.List>
		</Breadcrumb.Root>
		<h1 class="mt-1 text-2xl font-bold tracking-tight">Skills</h1>
		<p class="text-muted-foreground text-sm">Manage Agent Skills available to all connected agents.</p>
	</div>

	<div class="flex justify-end">
		<Button onclick={() => { createOpen = true; createContent = ""; }}>
			<PlusIcon class="mr-2 size-4" />
			New Skill
		</Button>
	</div>

	{#if skills.length === 0}
		<div class="text-muted-foreground flex flex-col items-center justify-center rounded-lg border border-dashed py-12">
			<p class="text-sm">No skills yet.</p>
			<Button variant="link" onclick={() => { createOpen = true; }}>Create your first skill</Button>
		</div>
	{:else}
		<div class="rounded-lg border">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>Name</Table.Head>
						<Table.Head>Description</Table.Head>
						<Table.Head class="w-[100px]"></Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each skills as skill (skill.slug)}
						<Table.Row>
							<Table.Cell>
								<span class="flex items-center gap-2">
									<a href="/skills/{skill.slug}" class="font-medium font-mono text-sm hover:underline">{skill.slug}</a>
									{#if skill.builtIn}
										<Badge class="border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300">built-in</Badge>
									{/if}
								</span>
							</Table.Cell>
							<Table.Cell class="text-muted-foreground text-sm max-w-md truncate">{skill.description}</Table.Cell>
							<Table.Cell>
								{#if !skill.builtIn}
									<Button
										variant="ghost"
										size="icon"
										onclick={() => { deleteTarget = skill; deleteOpen = true; }}
									>
										<TrashIcon class="size-4" />
									</Button>
								{/if}
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
	<Dialog.Content class="sm:max-w-2xl">
		<Dialog.Header>
			<Dialog.Title>New Skill</Dialog.Title>
			<Dialog.Description>Paste SKILL.md content with YAML frontmatter (name + description required).</Dialog.Description>
		</Dialog.Header>
		<form
			method="POST"
			action="?/create"
			use:enhance={() => {
				createSubmitting = true;
				return async ({ result, update }) => {
					createSubmitting = false;
					if (result.type === "success" && result.data?.created) {
						const created = result.data.created as { slug: string; description: string };
						localSkills = [...skills, { slug: created.slug, description: created.description }];
						createOpen = false;
						toast.success("Skill created");
					} else if (result.type === "failure") {
						toast.error((result.data?.error as string) ?? "Failed to create");
					}
					await update({ reset: false, invalidateAll: false });
				};
			}}
		>
			<div class="space-y-4 py-4">
				<div class="space-y-2">
					<Label for="content">SKILL.md Content</Label>
					<textarea
						id="content"
						name="content"
						bind:value={createContent}
						placeholder={"---\nname: my-skill\ndescription: What this skill does.\n---\n\n## Instructions\n\n..."}
						class="border-input bg-background placeholder:text-muted-foreground flex min-h-[200px] w-full rounded-md border px-3 py-2 font-mono text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
						rows="10"
						required
					></textarea>
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
			<Dialog.Title>Delete Skill</Dialog.Title>
			<Dialog.Description>
				This will permanently delete <strong>{deleteTarget?.slug}</strong>. This action cannot be undone.
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
						localSkills = skills.filter((s) => s.slug !== result.data?.deleted);
						deleteOpen = false;
						toast.success("Skill deleted");
					} else if (result.type === "failure") {
						toast.error((result.data?.error as string) ?? "Failed to delete");
					}
					await update({ reset: false, invalidateAll: false });
				};
			}}
		>
			<input type="hidden" name="slug" value={deleteTarget?.slug ?? ""} />
			<Dialog.Footer>
				<Button variant="outline" onclick={() => { deleteOpen = false; }}>Cancel</Button>
				<Button type="submit" variant="destructive" disabled={deleteSubmitting}>
					{deleteSubmitting ? "Deleting..." : "Delete"}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
