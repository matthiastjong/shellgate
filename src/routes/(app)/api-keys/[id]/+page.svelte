<script lang="ts">
import { enhance } from "$app/forms";
import { toast } from "svelte-sonner";
import { Button } from "$lib/components/ui/button/index.js";
import { Badge } from "$lib/components/ui/badge/index.js";
import * as Table from "$lib/components/ui/table/index.js";
import * as Sheet from "$lib/components/ui/sheet/index.js";
import * as Breadcrumb from "$lib/components/ui/breadcrumb/index.js";
import { Input } from "$lib/components/ui/input/index.js";
import { Label } from "$lib/components/ui/label/index.js";
import { Switch } from "$lib/components/ui/switch/index.js";
import LoaderCircleIcon from "@lucide/svelte/icons/loader-circle";
import type { PageData } from "./$types";

type Token = {
	id: string;
	name: string;
	createdAt: string | Date;
	revokedAt: string | Date | null;
	lastUsedAt: string | Date | null;
	updatedAt: string | Date;
};

type Target = {
	id: string;
	name: string;
	slug: string;
	type: string;
	baseUrl: string | null;
	enabled: boolean;
};

type Permission = {
	targetId: string;
};

let { data }: { data: PageData } = $props();

let localToken = $state<Token | null>(null);
let token = $derived<Token>(localToken ?? data.token as Token);

let localPermissionSet = $state<Set<string> | null>(null);
let permissionSet = $derived<Set<string>>(
	localPermissionSet ?? new Set((data.permissions as Permission[]).map((p) => p.targetId))
);

// Sheet state
let sheetOpen = $state(false);
let sheetSubmitting = $state(false);
let editName = $state("");

function openRenameSheet() {
	editName = token.name;
	sheetSubmitting = false;
	sheetOpen = true;
}

function formatDate(dateStr: string | Date): string {
	return new Date(dateStr).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}

function formatRelativeTime(dateStr: string | Date | null): string {
	if (!dateStr) return "Never";
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
</script>

<!-- Rename Sheet -->
<Sheet.Root bind:open={sheetOpen}>
	<Sheet.Content side="right">
		<Sheet.Header>
			<Sheet.Title>Rename API Key</Sheet.Title>
			<Sheet.Description>Update the name for this API key.</Sheet.Description>
		</Sheet.Header>
		<form
			method="POST"
			action="?/rename"
			use:enhance={() => {
				sheetSubmitting = true;
				return async ({ result, update }) => {
					sheetSubmitting = false;
					if (result.type === 'success' && result.data?.renamed) {
						const { name } = result.data.renamed as { id: string; name: string };
						localToken = { ...token, name };
						sheetOpen = false;
						toast.success('Key renamed');
					} else if (result.type === 'failure') {
						toast.error((result.data?.error as string) ?? 'Failed to rename');
					}
					await update({ reset: false, invalidateAll: false });
				};
			}}
		>
			<div class="grid gap-4 px-4">
				<div class="grid gap-2">
					<Label for="edit-name">Name</Label>
					<Input id="edit-name" name="name" bind:value={editName} required />
				</div>
				<Button type="submit" disabled={sheetSubmitting || !editName.trim()}>
					{#if sheetSubmitting}
						<LoaderCircleIcon class="mr-2 size-4 animate-spin" />
					{/if}
					Save
				</Button>
			</div>
		</form>
	</Sheet.Content>
</Sheet.Root>

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
					<Breadcrumb.Link href="/api-keys">API Keys</Breadcrumb.Link>
				</Breadcrumb.Item>
				<Breadcrumb.Separator />
				<Breadcrumb.Item>
					<Breadcrumb.Page>{token.name}</Breadcrumb.Page>
				</Breadcrumb.Item>
			</Breadcrumb.List>
		</Breadcrumb.Root>
		<div class="mt-1 flex items-center gap-2">
			<h1 class="text-2xl font-bold tracking-tight">{token.name}</h1>
			<Button variant="ghost" size="sm" class="h-6 text-xs" onclick={openRenameSheet}>Edit</Button>
		</div>
	</div>

	<!-- Token Info -->
	<div class="rounded-lg border p-6">
		<h2 class="mb-4 text-lg font-semibold">Key Information</h2>
		<dl class="grid gap-4 sm:grid-cols-2">
			<div>
				<dt class="text-muted-foreground text-sm">Status</dt>
				<dd>
					{#if token.revokedAt}
						<Badge variant="secondary">Revoked</Badge>
					{:else}
						<Badge class="border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300">Active</Badge>
					{/if}
				</dd>
			</div>
			<div>
				<dt class="text-muted-foreground text-sm">Created</dt>
				<dd class="text-sm">{formatDate(token.createdAt)}</dd>
			</div>
			<div>
				<dt class="text-muted-foreground text-sm">Last used</dt>
				<dd class="text-sm">{formatRelativeTime(token.lastUsedAt)}</dd>
			</div>
			<div>
				<dt class="text-muted-foreground text-sm">Updated</dt>
				<dd class="text-sm">{formatDate(token.updatedAt)}</dd>
			</div>
		</dl>
	</div>

	<!-- Permissions -->
	<div>
		<div class="mb-4">
			<h2 class="text-lg font-semibold">Target Access</h2>
			<p class="text-muted-foreground text-sm">Control which targets this API key can reach.</p>
		</div>

		{#if (data.targets as Target[]).length === 0}
			<div class="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed py-12">
				<p class="text-muted-foreground text-sm">No targets configured yet. Create a target first.</p>
			</div>
		{:else}
			<div class="rounded-lg border">
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>Target</Table.Head>
							<Table.Head>Type</Table.Head>
							<Table.Head>Status</Table.Head>
							<Table.Head class="w-20">Access</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each data.targets as target (target.id)}
							{@const hasPermission = permissionSet.has(target.id)}
							<Table.Row class={target.enabled === false ? 'opacity-60' : ''}>
								<Table.Cell class="font-medium">
									<a href="/targets/{target.slug}" class="hover:underline">{target.name}</a>
								</Table.Cell>
								<Table.Cell><Badge variant="outline">{target.type}</Badge></Table.Cell>
								<Table.Cell>
									{#if target.enabled === false}
										<Badge variant="secondary">Disabled</Badge>
									{:else}
										<Badge class="border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300">Active</Badge>
									{/if}
								</Table.Cell>
								<Table.Cell>
									<form
										method="POST"
										action={hasPermission ? "?/revoke" : "?/grant"}
										class="hidden"
										id="perm-form-{target.id}"
										use:enhance={() => {
											return async ({ result, update }) => {
												if (result.type === 'success') {
													const next = new Set(permissionSet);
													if (hasPermission) {
														next.delete(target.id);
														toast.success('Access revoked');
													} else {
														next.add(target.id);
														toast.success('Access granted');
													}
													localPermissionSet = next;
												} else if (result.type === 'failure') {
													toast.error((result.data?.error as string) ?? 'Failed');
												}
												await update({ reset: false, invalidateAll: false });
											};
										}}
									>
										<input type="hidden" name="targetId" value={target.id} />
									</form>
									<Switch
										checked={hasPermission}
										onCheckedChange={() => (document.getElementById(`perm-form-${target.id}`) as HTMLFormElement)?.requestSubmit()}
									/>
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</div>
		{/if}
	</div>
</div>
