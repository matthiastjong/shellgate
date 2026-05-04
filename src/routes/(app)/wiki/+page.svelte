<script lang="ts">
	import * as Table from "$lib/components/ui/table/index.js";
	import * as Breadcrumb from "$lib/components/ui/breadcrumb/index.js";
	import { Badge } from "$lib/components/ui/badge/index.js";
	import { Input } from "$lib/components/ui/input/index.js";
	import BookOpenIcon from "@lucide/svelte/icons/book-open";
	import type { PageData } from "./$types";

	let { data }: { data: PageData } = $props();

	type WikiPage = (typeof data.pages)[number];

	let search = $state("");
	let namespaceFilter = $state<string>("");
	let statusFilter = $state<string>("");

	let namespaces = $derived(
		[...new Set(data.pages.map((p: WikiPage) => p.namespace))].sort(),
	);

	let filtered = $derived(
		data.pages.filter((p: WikiPage) => {
			if (namespaceFilter && p.namespace !== namespaceFilter) return false;
			if (statusFilter && p.status !== statusFilter) return false;
			if (search) {
				const q = search.toLowerCase();
				return (
					p.title.toLowerCase().includes(q) ||
					p.slug.toLowerCase().includes(q) ||
					(p.summary?.toLowerCase().includes(q) ?? false) ||
					(p.tags?.some((t: string) => t.toLowerCase().includes(q)) ?? false)
				);
			}
			return true;
		}),
	);

	let expanded = $state<Set<string>>(new Set());

	function toggleExpand(slug: string) {
		const next = new Set(expanded);
		if (next.has(slug)) next.delete(slug);
		else next.add(slug);
		expanded = next;
	}

	function statusColor(s: string) {
		if (s === "active") return "border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300";
		if (s === "draft") return "border-yellow-200 bg-yellow-50 text-yellow-700 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-300";
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
					<Breadcrumb.Page>Wiki</Breadcrumb.Page>
				</Breadcrumb.Item>
			</Breadcrumb.List>
		</Breadcrumb.Root>
		<h1 class="mt-1 text-2xl font-bold tracking-tight">Wiki</h1>
		<p class="text-muted-foreground text-sm">
			Read-only view of compiled organizational knowledge. Pages are created and managed via MCP tools.
		</p>
	</div>

	<!-- Filters -->
	<div class="flex flex-wrap gap-2">
		<Input
			placeholder="Search pages..."
			bind:value={search}
			class="max-w-sm"
		/>
		<select
			class="rounded-md border px-3 py-1.5 text-sm bg-background"
			bind:value={namespaceFilter}
		>
			<option value="">All namespaces</option>
			{#each namespaces as ns}
				<option value={ns}>{ns}</option>
			{/each}
		</select>
		<button
			class="rounded-md border px-3 py-1.5 text-sm {statusFilter === '' ? 'bg-accent' : ''}"
			onclick={() => (statusFilter = "")}
		>All</button>
		<button
			class="rounded-md border px-3 py-1.5 text-sm {statusFilter === 'active' ? 'bg-accent' : ''}"
			onclick={() => (statusFilter = "active")}
		>Active</button>
		<button
			class="rounded-md border px-3 py-1.5 text-sm {statusFilter === 'draft' ? 'bg-accent' : ''}"
			onclick={() => (statusFilter = "draft")}
		>Draft</button>
		<button
			class="rounded-md border px-3 py-1.5 text-sm {statusFilter === 'archived' ? 'bg-accent' : ''}"
			onclick={() => (statusFilter = "archived")}
		>Archived</button>
	</div>

	{#if filtered.length === 0}
		<div class="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed py-12">
			<BookOpenIcon class="text-muted-foreground size-8" />
			<p class="text-muted-foreground text-sm">
				{search || namespaceFilter || statusFilter ? "No pages match your filters." : "No wiki pages yet. Agents will create them via MCP tools."}
			</p>
		</div>
	{:else}
		<div class="rounded-lg border">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>Title</Table.Head>
						<Table.Head class="w-28">Namespace</Table.Head>
						<Table.Head class="w-20">Status</Table.Head>
						<Table.Head class="w-16">Ver.</Table.Head>
						<Table.Head class="w-32">Updated by</Table.Head>
						<Table.Head class="w-28">Updated</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each filtered as page (page.slug + page.namespace)}
						<Table.Row
							class="cursor-pointer"
							onclick={() => toggleExpand(page.namespace + "/" + page.slug)}
						>
							<Table.Cell>
								<div class="font-medium">{page.title}</div>
								{#if page.tags && page.tags.length > 0}
									<div class="mt-1 flex gap-1">
										{#each page.tags as tag}
											<span class="bg-muted rounded px-1.5 py-0.5 text-xs">{tag}</span>
										{/each}
									</div>
								{/if}
							</Table.Cell>
							<Table.Cell class="text-muted-foreground text-sm">{page.namespace}</Table.Cell>
							<Table.Cell>
								<Badge class={statusColor(page.status)}>{page.status}</Badge>
							</Table.Cell>
							<Table.Cell class="text-muted-foreground text-sm">{page.version}</Table.Cell>
							<Table.Cell class="text-muted-foreground text-sm">
								{page.updatedBy ?? "—"}
							</Table.Cell>
							<Table.Cell class="text-muted-foreground text-sm">
								{formatDate(page.updatedAt)}
							</Table.Cell>
						</Table.Row>
						{#if expanded.has(page.namespace + "/" + page.slug)}
							<Table.Row>
								<Table.Cell colspan={6}>
									<div class="text-muted-foreground mb-2 text-xs">
										{page.slug}{#if page.summary} — {page.summary}{/if}
									</div>
									<div class="bg-muted/50 rounded-md p-4 text-sm whitespace-pre-wrap">{page.body}</div>
									{#if page.sources && page.sources.length > 0}
										<div class="mt-2 text-xs text-muted-foreground">
											<span class="font-medium">Sources:</span>
											{#each page.sources as src, i}
												<span>
													{src.title ?? src.type}{#if src.uri} (<a href={src.uri} target="_blank" class="underline">{src.uri}</a>){/if}{#if i < page.sources.length - 1}, {/if}
												</span>
											{/each}
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
