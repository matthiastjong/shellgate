<script lang="ts">
	import { goto } from "$app/navigation";
	import { page } from "$app/state";
	import { browser } from "$app/environment";
	import { Button } from "$lib/components/ui/button/index.js";
	import { Badge } from "$lib/components/ui/badge/index.js";
	import * as Table from "$lib/components/ui/table/index.js";
	import * as Dialog from "$lib/components/ui/dialog/index.js";
	import * as Breadcrumb from "$lib/components/ui/breadcrumb/index.js";
	import ScrollTextIcon from "@lucide/svelte/icons/scroll-text";
	import EyeIcon from "@lucide/svelte/icons/eye";
	import ExternalLinkIcon from "@lucide/svelte/icons/external-link";
	import type { PageData } from "./$types";

	type AuditLog = {
		id: string;
		tokenId: string | null;
		tokenName: string | null;
		targetId: string | null;
		targetSlug: string | null;
		type: string;
		method: string | null;
		path: string | null;
		statusCode: number | null;
		clientIp: string;
		durationMs: number | null;
		createdAt: string | Date;
	};

	let { data }: { data: PageData } = $props();

	let currentPage = $derived(data.page);
	let totalPages = $derived(Math.ceil(data.total / data.perPage));

	let detailLog = $state<AuditLog | null>(null);
	let detailOpen = $state(false);

	function openDetail(log: AuditLog) {
		detailLog = log;
		detailOpen = true;
	}

	function formatAction(log: AuditLog): string {
		if (log.type === "ssh") return log.path ?? "-";
		// gateway: "POST /users" or "GET /v1/chat"
		const method = log.method ?? "";
		const path = log.path ?? "";
		return method ? `${method} /${path}` : path || "-";
	}

	function formatRelativeTime(dateStr: string | Date): string {
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

	function formatTimestamp(dateStr: string | Date): string {
		return new Date(dateStr).toLocaleString("en-US", {
			month: "short",
			day: "numeric",
			year: "numeric",
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
		});
	}

	function formatDuration(ms: number | null): string {
		if (ms === null || ms === undefined) return "-";
		return `${ms}ms`;
	}

	function statusColor(code: number | null): string {
		if (code === null || code === undefined) return "text-muted-foreground";
		if ((code >= 200 && code < 300) || code === 0) return "text-green-600 dark:text-green-400";
		if (code >= 400 && code < 500) return "text-yellow-600 dark:text-yellow-400";
		if (code >= 500) return "text-red-600 dark:text-red-400";
		return "text-muted-foreground";
	}

	function applyFilter(key: string, value: string | null) {
		const params = new URLSearchParams(page.url.searchParams);
		if (value) {
			params.set(key, value);
		} else {
			params.delete(key);
		}
		params.delete("page");
		goto(`/logs?${params.toString()}`, { invalidateAll: true });
	}

	function goToPage(p: number) {
		const params = new URLSearchParams(page.url.searchParams);
		if (p > 1) {
			params.set("page", String(p));
		} else {
			params.delete("page");
		}
		goto(`/logs?${params.toString()}`, { invalidateAll: true });
	}
</script>

<!-- Detail Dialog -->
<Dialog.Root bind:open={detailOpen}>
	<Dialog.Content class="sm:max-w-xl">
		<Dialog.Header>
			<Dialog.Title>Audit Log Detail</Dialog.Title>
			<Dialog.Description>
				{#if detailLog}
					{detailLog.type === "gateway" ? "API" : "SSH"} request to {detailLog.targetSlug ?? "unknown"}
				{/if}
			</Dialog.Description>
		</Dialog.Header>
		{#if detailLog}
			<div class="flex flex-col gap-4 text-sm">
				{#if detailLog.type === "ssh" && detailLog.path}
					<div>
						<span class="text-muted-foreground mb-1.5 block font-medium">Command</span>
						<pre class="bg-muted rounded-md p-3 font-mono text-sm whitespace-pre-wrap break-all">{detailLog.path}</pre>
					</div>
				{:else if detailLog.path}
					<div>
						<span class="text-muted-foreground mb-1.5 block font-medium">Request</span>
						<pre class="bg-muted rounded-md p-3 font-mono text-sm whitespace-pre-wrap break-all">{detailLog.method ?? ""} /{detailLog.path}</pre>
					</div>
				{/if}

				<hr class="border-border" />

				<div class="grid grid-cols-[120px_1fr] gap-x-4 gap-y-2">
					<span class="text-muted-foreground font-medium">Type</span>
					<span>
						<Badge variant="secondary">{detailLog.type === "gateway" ? "API" : "SSH"}</Badge>
					</span>

					<span class="text-muted-foreground font-medium">Target</span>
					<span class="flex items-center gap-1.5 font-mono">
						{detailLog.targetSlug ?? "-"}
						{#if detailLog.targetSlug}
							<a href="/targets/{detailLog.targetSlug}" class="text-muted-foreground hover:text-foreground">
								<ExternalLinkIcon class="size-3.5" />
							</a>
						{/if}
					</span>

					<span class="text-muted-foreground font-medium">Token</span>
					<span class="flex items-center gap-1.5">
						{detailLog.tokenName ?? "-"}
						{#if detailLog.tokenId}
							<a href="/api-keys/{detailLog.tokenId}" class="text-muted-foreground hover:text-foreground">
								<ExternalLinkIcon class="size-3.5" />
							</a>
						{/if}
					</span>

					<span class="text-muted-foreground font-medium">Status</span>
					<span class="font-mono font-medium {statusColor(detailLog.statusCode)}">
						{detailLog.statusCode ?? "-"}
					</span>

					<span class="text-muted-foreground font-medium">Client IP</span>
					<span class="font-mono">{detailLog.clientIp}</span>

					<span class="text-muted-foreground font-medium">Duration</span>
					<span>{formatDuration(detailLog.durationMs)}</span>

					<span class="text-muted-foreground font-medium">Timestamp</span>
					<span>{formatTimestamp(detailLog.createdAt)}</span>
				</div>
			</div>
		{/if}
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (detailOpen = false)}>Close</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<div class="flex flex-col gap-6">
	<div>
		<Breadcrumb.Root>
			<Breadcrumb.List>
				<Breadcrumb.Item>
					<Breadcrumb.Link href="/">Shellgate</Breadcrumb.Link>
				</Breadcrumb.Item>
				<Breadcrumb.Separator />
				<Breadcrumb.Item>
					<Breadcrumb.Page>Audit Log</Breadcrumb.Page>
				</Breadcrumb.Item>
			</Breadcrumb.List>
		</Breadcrumb.Root>
		<h1 class="mt-1 text-2xl font-bold tracking-tight">Audit Log</h1>
	</div>

	<!-- Filters -->
	<div class="flex flex-wrap items-center gap-3">
		<select
			class="border-input bg-background ring-offset-background h-9 rounded-md border px-3 text-sm"
			value={data.filters.type ?? ""}
			onchange={(e) => applyFilter("type", (e.target as HTMLSelectElement).value || null)}
		>
			<option value="">All types</option>
			<option value="gateway">Gateway</option>
			<option value="ssh">SSH</option>
		</select>

		<select
			class="border-input bg-background ring-offset-background h-9 rounded-md border px-3 text-sm"
			value={data.filters.tokenId ?? ""}
			onchange={(e) => applyFilter("tokenId", (e.target as HTMLSelectElement).value || null)}
		>
			<option value="">All tokens</option>
			{#each data.activeTokens as token (token.id)}
				<option value={token.id}>{token.name}</option>
			{/each}
		</select>

		<select
			class="border-input bg-background ring-offset-background h-9 rounded-md border px-3 text-sm"
			value={data.filters.targetId ?? ""}
			onchange={(e) => applyFilter("targetId", (e.target as HTMLSelectElement).value || null)}
		>
			<option value="">All targets</option>
			{#each data.allTargets as target (target.id)}
				<option value={target.id}>{target.name} ({target.slug})</option>
			{/each}
		</select>
	</div>

	{#if data.logs.length === 0}
		<div class="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed py-16">
			<div class="bg-muted flex size-12 items-center justify-center rounded-full">
				<ScrollTextIcon class="text-muted-foreground size-6" />
			</div>
			<div class="text-center">
				<h2 class="text-lg font-semibold">No logs yet</h2>
				<p class="text-muted-foreground mt-1 text-sm">
					Audit logs will appear here when gateway or SSH requests are made.
				</p>
			</div>
		</div>
	{:else}
		<div class="rounded-lg border">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>IP</Table.Head>
						<Table.Head>Target</Table.Head>
						<Table.Head>Action</Table.Head>
						<Table.Head>Time</Table.Head>
						<Table.Head class="w-12"><span class="sr-only">Details</span></Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each data.logs as log (log.id)}
						<Table.Row>
							<Table.Cell class="text-muted-foreground font-mono text-sm">{log.clientIp}</Table.Cell>
							<Table.Cell class="text-sm">
								<div class="flex items-center gap-2">
									<Badge variant="secondary" class="w-10 justify-center text-xs">
										{log.type === "gateway" ? "API" : "SSH"}
									</Badge>
									<span class="font-mono">{log.targetSlug ?? "-"}</span>
								</div>
							</Table.Cell>
							<Table.Cell class="max-w-[300px] truncate font-mono text-sm" title={formatAction(log as AuditLog)}>
								<span class={statusColor(log.statusCode)}>{formatAction(log as AuditLog)}</span>
							</Table.Cell>
							<Table.Cell class="text-muted-foreground whitespace-nowrap text-sm">
								{formatRelativeTime(log.createdAt)}
							</Table.Cell>
							<Table.Cell>
								<Button variant="ghost" size="icon" class="size-8" onclick={() => openDetail(log as AuditLog)}>
									<EyeIcon class="size-4" />
									<span class="sr-only">View details</span>
								</Button>
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</div>

		<!-- Pagination -->
		{#if totalPages > 1}
			<div class="flex items-center justify-between">
				<p class="text-muted-foreground text-sm">
					{data.total} total log{data.total !== 1 ? "s" : ""}
				</p>
				<div class="flex items-center gap-2">
					<Button
						variant="outline"
						size="sm"
						disabled={currentPage <= 1}
						onclick={() => goToPage(currentPage - 1)}
					>
						Previous
					</Button>
					<span class="text-muted-foreground text-sm">
						Page {currentPage} of {totalPages}
					</span>
					<Button
						variant="outline"
						size="sm"
						disabled={currentPage >= totalPages}
						onclick={() => goToPage(currentPage + 1)}
					>
						Next
					</Button>
				</div>
			</div>
		{/if}
	{/if}
</div>
