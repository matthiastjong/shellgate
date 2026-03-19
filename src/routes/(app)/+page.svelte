<script lang="ts">
import * as Breadcrumb from "$lib/components/ui/breadcrumb/index.js";
import * as Card from "$lib/components/ui/card/index.js";
import { Button } from "$lib/components/ui/button/index.js";
import ServerIcon from "@lucide/svelte/icons/server";
import KeyRoundIcon from "@lucide/svelte/icons/key-round";
import ShieldIcon from "@lucide/svelte/icons/shield";
import PlusIcon from "@lucide/svelte/icons/plus";
import ArrowRightIcon from "@lucide/svelte/icons/arrow-right";
import type { PageData } from "./$types";

let { data }: { data: PageData } = $props();
let stats = $derived(data.stats);
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
				<Card.Title class="text-sm font-medium">Auth Methods</Card.Title>
				<ShieldIcon class="text-muted-foreground size-4" />
			</Card.Header>
			<Card.Content>
				<div class="text-2xl font-bold">{stats.totalAuthMethods}</div>
				<p class="text-muted-foreground text-xs">across all targets</p>
			</Card.Content>
		</Card.Root>
	</div>

	<div>
		<h2 class="mb-3 text-lg font-semibold">Quick Actions</h2>
		<div class="flex flex-wrap gap-3">
			<Button variant="outline" href="/targets">
				<PlusIcon class="mr-2 size-4" />
				Create Target
			</Button>
			<Button variant="outline" href="/api-keys">
				<PlusIcon class="mr-2 size-4" />
				Create API Key
			</Button>
			<Button variant="outline" href="/targets">
				<ArrowRightIcon class="mr-2 size-4" />
				View Targets
			</Button>
		</div>
	</div>
</div>
