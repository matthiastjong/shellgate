<script lang="ts">
	import * as Table from "$lib/components/ui/table/index.js";
	import * as Breadcrumb from "$lib/components/ui/breadcrumb/index.js";
	import { Badge } from "$lib/components/ui/badge/index.js";
	import { Input } from "$lib/components/ui/input/index.js";
	import BrainIcon from "@lucide/svelte/icons/brain";
	import type { PageData } from "./$types";

	let { data }: { data: PageData } = $props();

	type Memory = (typeof data.memories)[number];

	let search = $state("");
	let visibilityFilter = $state<string>("");

	let filtered = $derived(
		data.memories.filter((m: Memory) => {
			if (visibilityFilter && m.visibility !== visibilityFilter) return false;
			if (search) {
				const q = search.toLowerCase();
				return (
					m.summary.toLowerCase().includes(q) ||
					m.content.toLowerCase().includes(q) ||
					(m.userIdentifier?.toLowerCase().includes(q) ?? false)
				);
			}
			return true;
		}),
	);

	let expanded = $state<Set<string>>(new Set());

	function toggleExpand(id: string) {
		const next = new Set(expanded);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		expanded = next;
	}

	function visibilityColor(v: string) {
		if (v === "org") return "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300";
		if (v === "user") return "border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-950 dark:text-purple-300";
		return "border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300";
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
					<Breadcrumb.Page>Memories</Breadcrumb.Page>
				</Breadcrumb.Item>
			</Breadcrumb.List>
		</Breadcrumb.Root>
		<h1 class="mt-1 text-2xl font-bold tracking-tight">Agent Memories</h1>
		<p class="text-muted-foreground text-sm">
			Read-only view of all memories stored by agents. Memories are created and managed via MCP tools.
		</p>
	</div>

	<!-- Filters -->
	<div class="flex gap-2">
		<Input
			placeholder="Search memories..."
			bind:value={search}
			class="max-w-sm"
		/>
		<button
			class="rounded-md border px-3 py-1.5 text-sm {visibilityFilter === '' ? 'bg-accent' : ''}"
			onclick={() => (visibilityFilter = "")}
		>All</button>
		<button
			class="rounded-md border px-3 py-1.5 text-sm {visibilityFilter === 'org' ? 'bg-accent' : ''}"
			onclick={() => (visibilityFilter = "org")}
		>Org</button>
		<button
			class="rounded-md border px-3 py-1.5 text-sm {visibilityFilter === 'user' ? 'bg-accent' : ''}"
			onclick={() => (visibilityFilter = "user")}
		>User</button>
		<button
			class="rounded-md border px-3 py-1.5 text-sm {visibilityFilter === 'token' ? 'bg-accent' : ''}"
			onclick={() => (visibilityFilter = "token")}
		>Token</button>
	</div>

	{#if filtered.length === 0}
		<div class="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed py-12">
			<BrainIcon class="text-muted-foreground size-8" />
			<p class="text-muted-foreground text-sm">
				{search || visibilityFilter ? "No memories match your filters." : "No memories yet. Agents will create them via MCP tools."}
			</p>
		</div>
	{:else}
		<div class="rounded-lg border">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>Summary</Table.Head>
						<Table.Head class="w-24">Visibility</Table.Head>
						<Table.Head class="w-32">User</Table.Head>
						<Table.Head class="w-32">Token</Table.Head>
						<Table.Head class="w-28">Updated</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each filtered as memory (memory.id)}
						<Table.Row
							class="cursor-pointer"
							onclick={() => toggleExpand(memory.id)}
						>
							<Table.Cell class="font-medium">{memory.summary}</Table.Cell>
							<Table.Cell>
								<Badge class={visibilityColor(memory.visibility)}>{memory.visibility}</Badge>
							</Table.Cell>
							<Table.Cell class="text-muted-foreground text-sm">
								{memory.userIdentifier ?? "—"}
							</Table.Cell>
							<Table.Cell class="text-muted-foreground text-sm">
								{memory.tokenName ?? "deleted"}
							</Table.Cell>
							<Table.Cell class="text-muted-foreground text-sm">
								{formatDate(memory.updatedAt)}
							</Table.Cell>
						</Table.Row>
						{#if expanded.has(memory.id)}
							<Table.Row>
								<Table.Cell colspan={5}>
									<div class="bg-muted/50 rounded-md p-4 text-sm whitespace-pre-wrap">
										{memory.content}
									</div>
									{#if memory.metadata && Object.keys(memory.metadata).length > 0}
										<div class="text-muted-foreground mt-2 text-xs">
											Metadata: {JSON.stringify(memory.metadata)}
										</div>
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
