<script lang="ts">
	import { enhance } from "$app/forms";
	import { page } from "$app/state";
	import { toast } from "svelte-sonner";
	import { Button } from "$lib/components/ui/button/index.js";
	import { Badge } from "$lib/components/ui/badge/index.js";
	import * as Table from "$lib/components/ui/table/index.js";
	import * as Dialog from "$lib/components/ui/dialog/index.js";
	import * as Breadcrumb from "$lib/components/ui/breadcrumb/index.js";
	import CopyIcon from "@lucide/svelte/icons/copy";
	import CheckIcon from "@lucide/svelte/icons/check";
	import type { PageData } from "./$types";

	let { data }: { data: PageData } = $props();

	type Event = (typeof data.events)[number];

	let copied = $state(false);
	let selectedEvent = $state<Event | null>(null);
	let dialogOpen = $state(false);
	let instructions = $state(data.endpoint.handlingInstructions ?? "");
	let instructionsSaving = $state(false);

	function webhookUrl(slug: string) {
		return `${page.url.origin}/webhooks/incoming/${slug}`;
	}

	function displaySecret(hint: string | null): string {
		return hint ?? "Not configured";
	}

	function copyToClipboard(text: string) {
		navigator.clipboard.writeText(text);
		copied = true;
		toast.success("Copied to clipboard");
		setTimeout(() => {
			copied = false;
		}, 2000);
	}

	function formatDate(d: string | Date) {
		return new Date(d).toLocaleDateString("en-US", {
			month: "short",
			day: "numeric",
			year: "numeric",
		});
	}

	function formatDateTime(d: string | Date | null) {
		if (!d) return "—";
		return new Date(d).toLocaleString("en-US", {
			month: "short",
			day: "numeric",
			year: "numeric",
			hour: "numeric",
			minute: "2-digit",
		});
	}

	function truncatePayload(body: unknown): string {
		const str = JSON.stringify(body);
		if (str.length <= 80) return str;
		return str.slice(0, 80) + "…";
	}

	function prettyJson(val: unknown): string {
		return JSON.stringify(val, null, 2);
	}

	function openEvent(event: Event) {
		selectedEvent = event;
		dialogOpen = true;
	}

	function statusVariant(status: string): "default" | "secondary" | "outline" {
		if (status === "delivered") return "secondary";
		if (status === "expired") return "outline";
		return "default";
	}
</script>

<!-- Event Detail Dialog -->
<Dialog.Root bind:open={dialogOpen}>
	<Dialog.Content class="max-w-2xl">
		<Dialog.Header>
			<Dialog.Title>Event Detail</Dialog.Title>
			<Dialog.Description>Full headers and body for this webhook event.</Dialog.Description>
		</Dialog.Header>
		{#if selectedEvent}
			<div class="flex flex-col gap-4 overflow-auto">
				<div>
					<p class="mb-1 text-sm font-medium">Status</p>
					<Badge variant={statusVariant(selectedEvent.status)}>{selectedEvent.status}</Badge>
				</div>
				<div>
					<p class="mb-1 text-sm font-medium">Received</p>
					<p class="text-muted-foreground text-sm">{formatDateTime(selectedEvent.receivedAt)}</p>
				</div>
				{#if selectedEvent.deliveredAt}
					<div>
						<p class="mb-1 text-sm font-medium">Delivered</p>
						<p class="text-muted-foreground text-sm">{formatDateTime(selectedEvent.deliveredAt)}</p>
					</div>
				{/if}
				<div>
					<p class="mb-1 text-sm font-medium">Headers</p>
					<pre class="bg-muted overflow-auto rounded-md p-3 text-xs">{prettyJson(selectedEvent.headers)}</pre>
				</div>
				<div>
					<p class="mb-1 text-sm font-medium">Body</p>
					<pre class="bg-muted overflow-auto rounded-md p-3 text-xs">{prettyJson(selectedEvent.body)}</pre>
				</div>
			</div>
		{/if}
	</Dialog.Content>
</Dialog.Root>

<!-- Page Content -->
<div class="flex flex-col gap-6">
	<div>
		<Breadcrumb.Root>
			<Breadcrumb.List>
				<Breadcrumb.Item>
					<Breadcrumb.Link href="/">Shellgate</Breadcrumb.Link>
				</Breadcrumb.Item>
				<Breadcrumb.Separator />
				<Breadcrumb.Item>
					<Breadcrumb.Link href="/webhooks">Webhooks</Breadcrumb.Link>
				</Breadcrumb.Item>
				<Breadcrumb.Separator />
				<Breadcrumb.Item>
					<Breadcrumb.Page>{data.endpoint.name}</Breadcrumb.Page>
				</Breadcrumb.Item>
			</Breadcrumb.List>
		</Breadcrumb.Root>
		<div class="mt-1 flex items-center gap-2">
			<h1 class="text-2xl font-bold tracking-tight">{data.endpoint.name}</h1>
			<span class="text-muted-foreground text-sm">
				linked to <a href="/api-keys/{data.endpoint.tokenId}" class="hover:underline">{data.tokenName}</a>
			</span>
		</div>
	</div>

	<!-- Endpoint Details -->
	<div class="rounded-lg border p-6">
		<h2 class="mb-4 text-lg font-semibold">Endpoint Details</h2>
		<dl class="grid gap-4 sm:grid-cols-2">
			<div class="sm:col-span-2">
				<dt class="text-muted-foreground mb-1 text-sm">Webhook URL</dt>
				<dd class="flex items-center gap-2">
					<code class="bg-muted rounded px-2 py-1 text-sm break-all">{webhookUrl(data.endpoint.slug)}</code>
					<Button
						variant="ghost"
						size="icon"
						class="size-7 shrink-0"
						onclick={() => copyToClipboard(webhookUrl(data.endpoint.slug))}
					>
						{#if copied}
							<CheckIcon class="size-4 text-green-600" />
						{:else}
							<CopyIcon class="size-4" />
						{/if}
					</Button>
				</dd>
			</div>
			<div>
				<dt class="text-muted-foreground mb-1 text-sm">Secret</dt>
				<dd class="font-mono text-sm">{displaySecret(data.endpoint.secretHint)}</dd>
			</div>
			<div>
				<dt class="text-muted-foreground mb-1 text-sm">Signature Header</dt>
				<dd class="font-mono text-sm">{data.endpoint.signatureHeader ?? "Not configured"}</dd>
			</div>
			<div>
				<dt class="text-muted-foreground mb-1 text-sm">Status</dt>
				<dd>
					{#if data.endpoint.enabled}
						<Badge class="border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300">Enabled</Badge>
					{:else}
						<Badge variant="secondary">Disabled</Badge>
					{/if}
				</dd>
			</div>
			<div>
				<dt class="text-muted-foreground mb-1 text-sm">Created</dt>
				<dd class="text-sm">{formatDate(data.endpoint.createdAt)}</dd>
			</div>
		</dl>
	</div>

	<!-- Handling Instructions -->
	<div class="rounded-lg border p-6">
		<h2 class="mb-2 text-lg font-semibold">Handling Instructions</h2>
		<p class="text-muted-foreground mb-4 text-sm">
			Tell your agent how to process events from this webhook. If empty, your agent will ask how to handle events.
		</p>
		<form
			method="POST"
			action="?/saveInstructions"
			use:enhance={() => {
				instructionsSaving = true;
				return async ({ result, update }) => {
					instructionsSaving = false;
					if (result.type === "success" && result.data?.saved) {
						data.endpoint.handlingInstructions = instructions.trim() || null;
						toast.success("Instructions saved");
					} else if (result.type === "failure") {
						toast.error((result.data?.error as string) ?? "Failed to save");
					}
					await update({ reset: false, invalidateAll: false });
				};
			}}
		>
			<textarea
				name="instructions"
				bind:value={instructions}
				placeholder="e.g. When a new issue is created, send me a message with the title and link. Ignore comment events."
				class="border-input bg-background placeholder:text-muted-foreground flex min-h-[100px] w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
				rows="4"
			></textarea>
			<div class="mt-3 flex items-center gap-3">
				<Button type="submit" disabled={instructionsSaving}>
					{instructionsSaving ? "Saving..." : "Save"}
				</Button>
				{#if !data.endpoint.handlingInstructions}
					<span class="text-muted-foreground text-sm">No instructions configured. Your agent will ask how to handle events.</span>
				{/if}
			</div>
		</form>
	</div>

	<!-- Setup Instructions -->
	<div class="rounded-lg border border-dashed p-6">
		<h2 class="mb-3 text-lg font-semibold">Setup</h2>
		<ol class="text-muted-foreground list-inside list-decimal space-y-2 text-sm">
			<li>
				Configure this URL in your external service (e.g. Linear, GitHub):
				<span class="flex items-center gap-2 mt-1">
					<code class="bg-muted rounded px-2 py-1 text-xs break-all">{webhookUrl(data.endpoint.slug)}</code>
					<Button
						variant="ghost"
						size="icon"
						class="size-6 shrink-0"
						onclick={() => copyToClipboard(webhookUrl(data.endpoint.slug))}
					>
						<CopyIcon class="size-3" />
					</Button>
				</span>
			</li>
			<li>
				If you haven't already, re-run the Shellgate installer for your agent to enable polling.
				<a href="/connect" class="text-foreground underline underline-offset-2">Go to Connect Agent</a>
			</li>
			<li>
				When your agent receives its first webhook from this service, it will ask you how to handle it. You can then create a dedicated skill for automatic processing.
			</li>
		</ol>
	</div>

	<!-- Recent Events -->
	<div>
		<div class="mb-4">
			<h2 class="text-lg font-semibold">Recent Events</h2>
			<p class="text-muted-foreground text-sm">Last 50 webhook events received by this endpoint.</p>
		</div>

		{#if data.events.length === 0}
			<div class="text-muted-foreground flex flex-col items-center justify-center rounded-lg border border-dashed py-12">
				<p class="text-sm">No events received yet.</p>
				<p class="text-sm">Events will appear here once webhooks start arriving.</p>
			</div>
		{:else}
			<div class="rounded-lg border">
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>Status</Table.Head>
							<Table.Head>Payload</Table.Head>
							<Table.Head>Received</Table.Head>
							<Table.Head>Delivered</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each data.events as event (event.id)}
							<Table.Row
								class="cursor-pointer hover:bg-muted/50"
								onclick={() => openEvent(event)}
							>
								<Table.Cell>
									<Badge variant={statusVariant(event.status)}>{event.status}</Badge>
								</Table.Cell>
								<Table.Cell class="font-mono text-xs text-muted-foreground max-w-sm truncate">
									{truncatePayload(event.body)}
								</Table.Cell>
								<Table.Cell class="text-sm whitespace-nowrap">
									{formatDateTime(event.receivedAt)}
								</Table.Cell>
								<Table.Cell class="text-sm whitespace-nowrap">
									{formatDateTime(event.deliveredAt)}
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</div>
		{/if}
	</div>
</div>
