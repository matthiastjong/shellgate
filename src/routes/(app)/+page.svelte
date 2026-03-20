<script lang="ts">
import * as Breadcrumb from "$lib/components/ui/breadcrumb/index.js";
import * as Card from "$lib/components/ui/card/index.js";
import { Button } from "$lib/components/ui/button/index.js";
import { Badge } from "$lib/components/ui/badge/index.js";
import ServerIcon from "@lucide/svelte/icons/server";
import KeyRoundIcon from "@lucide/svelte/icons/key-round";
import ActivityIcon from "@lucide/svelte/icons/activity";
import PlusIcon from "@lucide/svelte/icons/plus";
import ArrowRightIcon from "@lucide/svelte/icons/arrow-right";
import ListIcon from "@lucide/svelte/icons/list";
import PlugIcon from "@lucide/svelte/icons/plug";
import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";
import { browser } from "$app/environment";
import type { PageData } from "./$types";

let { data }: { data: PageData } = $props();
let stats = $derived(data.stats);
let recentActivity = $derived(data.recentActivity);
let activeAgents = $derived(data.activeAgents);
let errorsLast24h = $derived(data.errorsLast24h);

function formatRelativeTime(dateStr: string | Date | null): string {
	if (!dateStr) return "Never";
	if (!browser) return formatDate(dateStr);
	const date = new Date(dateStr);
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffSec = Math.floor(diffMs / 1000);
	const diffMin = Math.floor(diffSec / 60);
	const diffHour = Math.floor(diffMin / 60);
	const diffDay = Math.floor(diffHour / 24);

	if (diffSec < 60) return `${diffSec}s ago`;
	if (diffMin < 60) return `${diffMin}m ago`;
	if (diffHour < 24) return `${diffHour}h ago`;
	if (diffDay === 1) return "yesterday";
	if (diffDay < 7) return `${diffDay}d ago`;

	const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
	if (diffDay < 30) return rtf.format(-diffDay, "day");
	if (diffDay < 365) return rtf.format(-Math.floor(diffDay / 30), "month");
	return rtf.format(-Math.floor(diffDay / 365), "year");
}

function formatDate(dateStr: string | Date): string {
	return new Date(dateStr).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}

function formatAction(log: typeof recentActivity[0]): string {
	if (log.type === "ssh") {
		// Show first 40 chars of command
		const cmd = log.path ?? "-";
		return cmd.length > 40 ? cmd.slice(0, 40) + "..." : cmd;
	}
	// gateway: "POST /users" or "GET /v1/chat"
	const method = log.method ?? "";
	const path = log.path ?? "";
	return method ? `${method} ${path}` : path || "-";
}

function statusColor(code: number | null): "green" | "yellow" | "red" | "default" {
	if (code === null || code === undefined) return "default";
	if ((code >= 200 && code < 300) || code === 0) return "green";
	if (code >= 400 && code < 500) return "yellow";
	if (code >= 500) return "red";
	return "default";
}

function statusDotClass(color: "green" | "yellow" | "red" | "default"): string {
	if (color === "green") return "bg-green-500";
	if (color === "yellow") return "bg-yellow-500";
	if (color === "red") return "bg-red-500";
	return "bg-muted-foreground";
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
					<Breadcrumb.Page>Dashboard</Breadcrumb.Page>
				</Breadcrumb.Item>
			</Breadcrumb.List>
		</Breadcrumb.Root>
		<h1 class="mt-1 text-2xl font-bold tracking-tight">Dashboard</h1>
	</div>

	<Card.Root class="border-primary/20 bg-primary/5">
		<Card.Header class="flex flex-row items-center justify-between space-y-0">
			<div>
				<Card.Title>Connect an Agent</Card.Title>
				<Card.Description>Set up a secure connection to Shellgate in under 2 minutes</Card.Description>
			</div>
			<Button href="/connect">
				Get Started
				<ArrowRightIcon class="ml-2 size-4" />
			</Button>
		</Card.Header>
	</Card.Root>

	{#if errorsLast24h > 0}
		<Card.Root class="border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950/30">
			<Card.Header class="flex flex-row items-center gap-3 space-y-0 pb-3">
				<TriangleAlertIcon class="size-5 text-yellow-600 dark:text-yellow-400" />
				<div class="flex-1">
					<Card.Title class="text-base">Errors Detected</Card.Title>
					<Card.Description class="text-yellow-700 dark:text-yellow-300">
						{errorsLast24h} failed request{errorsLast24h > 1 ? "s" : ""} in the last 24 hours
					</Card.Description>
				</div>
				<Button variant="outline" size="sm" href="/logs?status=error">
					View Logs
				</Button>
			</Card.Header>
		</Card.Root>
	{/if}

	<div class="grid gap-4 md:grid-cols-3">
		<Card.Root>
			<Card.Header class="flex flex-row items-center justify-between space-y-0 pb-2">
				<Card.Title class="text-sm font-medium">Targets</Card.Title>
				<ServerIcon class="text-muted-foreground size-4" />
			</Card.Header>
			<Card.Content>
				<div class="text-2xl font-bold">{stats.totalTargets}</div>
				<p class="text-muted-foreground text-xs">{stats.activeTargets} active</p>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header class="flex flex-row items-center justify-between space-y-0 pb-2">
				<Card.Title class="text-sm font-medium">API Keys</Card.Title>
				<KeyRoundIcon class="text-muted-foreground size-4" />
			</Card.Header>
			<Card.Content>
				<div class="text-2xl font-bold">{stats.totalApiKeys}</div>
				<p class="text-muted-foreground text-xs">{stats.activeApiKeys} active / {stats.revokedApiKeys} revoked</p>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header class="flex flex-row items-center justify-between space-y-0 pb-2">
				<Card.Title class="text-sm font-medium">Requests Today</Card.Title>
				<ActivityIcon class="text-muted-foreground size-4" />
			</Card.Header>
			<Card.Content>
				<div class="text-2xl font-bold">{stats.requestsToday}</div>
				<p class="text-muted-foreground text-xs">gateway + ssh</p>
			</Card.Content>
		</Card.Root>
	</div>

	<div class="grid gap-6 lg:grid-cols-2">
		<!-- Recent Activity -->
		<Card.Root>
			<Card.Header>
				<Card.Title>Recent Activity</Card.Title>
				<Card.Description>Last 8 requests across all targets</Card.Description>
			</Card.Header>
			<Card.Content>
				{#if recentActivity.length === 0}
					<div class="flex flex-col items-center justify-center py-8 text-center">
						<div class="bg-muted mb-3 flex size-10 items-center justify-center rounded-full">
							<ActivityIcon class="text-muted-foreground size-5" />
						</div>
						<p class="text-muted-foreground text-sm">No requests yet. Connect an agent to get started.</p>
					</div>
				{:else}
					<div class="space-y-3">
						{#each recentActivity as log (log.id)}
							<div class="flex items-center gap-3 text-sm">
								<div class="flex size-2 shrink-0 rounded-full {statusDotClass(statusColor(log.statusCode))}"></div>
								<div class="flex min-w-0 flex-1 items-center gap-2">
									<span class="font-medium truncate">{log.tokenName ?? "Unknown"}</span>
									<ArrowRightIcon class="text-muted-foreground size-3 shrink-0" />
									<span class="text-muted-foreground font-mono truncate">{log.targetSlug ?? "-"}</span>
								</div>
								<div class="flex shrink-0 items-center gap-3">
									<span class="text-muted-foreground max-w-[200px] truncate font-mono text-xs" title={formatAction(log)}>
										{formatAction(log)}
									</span>
									{#if log.durationMs !== null}
										<span class="text-muted-foreground text-xs">{log.durationMs}ms</span>
									{/if}
									<span class="text-muted-foreground w-12 text-right text-xs">{formatRelativeTime(log.createdAt)}</span>
								</div>
							</div>
						{/each}
					</div>
					<div class="mt-4 flex justify-center">
						<Button variant="ghost" size="sm" href="/logs">
							View all logs
							<ArrowRightIcon class="ml-1 size-3" />
						</Button>
					</div>
				{/if}
			</Card.Content>
		</Card.Root>

		<!-- Active Agents -->
		<Card.Root>
			<Card.Header>
				<Card.Title>Active Agents</Card.Title>
				<Card.Description>API keys sorted by last activity</Card.Description>
			</Card.Header>
			<Card.Content>
				{#if activeAgents.length === 0}
					<div class="flex flex-col items-center justify-center py-8 text-center">
						<div class="bg-muted mb-3 flex size-10 items-center justify-center rounded-full">
							<KeyRoundIcon class="text-muted-foreground size-5" />
						</div>
						<p class="text-muted-foreground text-sm">No API keys created yet.</p>
					</div>
				{:else}
					<div class="space-y-3">
						{#each activeAgents as agent (agent.id)}
							<a
								href="/logs?tokenId={agent.id}"
								class="hover:bg-muted/50 flex items-center justify-between rounded-lg p-2 transition-colors"
							>
								<div class="flex flex-col gap-0.5">
									<span class="text-sm font-medium">{agent.name}</span>
									<span class="text-muted-foreground text-xs">
										{#if agent.lastUsedAt}
											Last active: {formatRelativeTime(agent.lastUsedAt)}
										{:else}
											<span class="text-muted-foreground/60">Never used</span>
										{/if}
									</span>
								</div>
								<ArrowRightIcon class="text-muted-foreground size-4 shrink-0" />
							</a>
						{/each}
					</div>
					<div class="mt-4 flex justify-center">
						<Button variant="ghost" size="sm" href="/api-keys">
							Manage API keys
							<ArrowRightIcon class="ml-1 size-3" />
						</Button>
					</div>
				{/if}
			</Card.Content>
		</Card.Root>
	</div>

	<div>
		<h2 class="mb-3 text-lg font-semibold">Quick Actions</h2>
		<div class="flex flex-wrap gap-3">
			<Button variant="outline" href="/targets">
				<PlusIcon class="mr-2 size-4" />
				Add Target
			</Button>
			<Button variant="outline" href="/api-keys">
				<PlusIcon class="mr-2 size-4" />
				Create API Key
			</Button>
			<Button variant="outline" href="/logs">
				<ListIcon class="mr-2 size-4" />
				View Logs
			</Button>
			<Button variant="outline" href="/connect">
				<PlugIcon class="mr-2 size-4" />
				Connect Agent
			</Button>
		</div>
	</div>
</div>
