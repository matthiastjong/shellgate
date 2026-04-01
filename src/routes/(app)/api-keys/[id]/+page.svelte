<script lang="ts">
import { enhance } from "$app/forms";
import { page } from "$app/state";
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
import LinkIcon from "@lucide/svelte/icons/link";
import CopyIcon from "@lucide/svelte/icons/copy";
import type { PageData } from "./$types";

type Token = {
	id: string;
	name: string;
	webhookKey?: string | null;
	webhookSecret?: string | null;
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

// Webhook state
let webhookSubmitting = $state(false);
let webhookSecretInput = $state("");
let showSecret = $state(false);

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

function getWebhookUrl(webhookKey: string): string {
	return `${page.url.origin}/inbound/${webhookKey}/[channel]`;
}

async function copyWebhookUrl(webhookKey: string) {
	await navigator.clipboard.writeText(getWebhookUrl(webhookKey));
	toast.success("Copied to clipboard");
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

	<!-- Inbound Webhooks -->
	<div class="rounded-lg border p-6">
		<div class="mb-4 flex items-center justify-between">
			<div class="flex items-center gap-2">
				<LinkIcon class="text-muted-foreground size-5" />
				<h2 class="text-lg font-semibold">Inbound Webhooks</h2>
			</div>
			{#if token.webhookKey}
				<form
					method="POST"
					action="?/disableWebhook"
					use:enhance={() => {
						webhookSubmitting = true;
						return async ({ result, update }) => {
							webhookSubmitting = false;
							if (result.type === 'success') {
								localToken = { ...token, webhookKey: null, webhookSecret: null };
								toast.success('Webhook disabled');
							} else if (result.type === 'failure') {
								toast.error((result.data?.error as string) ?? 'Failed to disable webhook');
							}
							await update({ reset: false, invalidateAll: false });
						};
					}}
				>
					<Button type="submit" variant="outline" size="sm" disabled={webhookSubmitting}>
						{#if webhookSubmitting}
							<LoaderCircleIcon class="mr-2 size-4 animate-spin" />
						{/if}
						Disable
					</Button>
				</form>
			{/if}
		</div>

		{#if !token.webhookKey}
			<!-- Disabled state -->
			<div class="flex flex-col items-center gap-4 py-6 text-center">
				<p class="text-muted-foreground max-w-sm text-sm">
					Receive webhooks from external services (Linear, GitHub, Stripe, ...) and let your agent poll and process them.
				</p>
				<form
					method="POST"
					action="?/enableWebhook"
					use:enhance={() => {
						webhookSubmitting = true;
						return async ({ result, update }) => {
							webhookSubmitting = false;
							if (result.type === 'success' && result.data?.webhookKey) {
								localToken = { ...token, webhookKey: result.data.webhookKey as string };
								toast.success('Webhook enabled');
							} else if (result.type === 'failure') {
								toast.error((result.data?.error as string) ?? 'Failed to enable webhook');
							}
							await update({ reset: false, invalidateAll: false });
						};
					}}
				>
					<Button type="submit" disabled={webhookSubmitting}>
						{#if webhookSubmitting}
							<LoaderCircleIcon class="mr-2 size-4 animate-spin" />
						{/if}
						Enable
					</Button>
				</form>
			</div>
		{:else}
			<!-- Enabled state -->
			<div class="flex flex-col gap-5">
				<!-- Webhook URL -->
				<div class="grid gap-1.5">
					<Label class="text-sm font-medium">Webhook URL</Label>
					<div class="flex items-center gap-2">
						<code class="bg-muted flex-1 rounded px-3 py-2 font-mono text-sm">
							{page.url.origin}/inbound/{token.webhookKey}/<span class="text-muted-foreground italic">[channel]</span>
						</code>
						<Button
							variant="outline"
							size="sm"
							onclick={() => copyWebhookUrl(token.webhookKey!)}
						>
							<CopyIcon class="size-4" />
						</Button>
					</div>
					<p class="text-muted-foreground text-xs">Replace <span class="font-mono italic">[channel]</span> with your own label, e.g. <span class="font-mono">linear</span> or <span class="font-mono">github</span>.</p>
				</div>

				<!-- Signature Secret -->
				<div class="grid gap-1.5">
					<Label for="webhook-secret" class="text-sm font-medium">Signature Secret <span class="text-muted-foreground font-normal">(optional)</span></Label>
					<form
						method="POST"
						action="?/setWebhookSecret"
						class="flex items-center gap-2"
						use:enhance={() => {
							return async ({ result, update }) => {
								if (result.type === 'success') {
									toast.success('Secret saved');
									webhookSecretInput = "";
								} else if (result.type === 'failure') {
									toast.error((result.data?.error as string) ?? 'Failed to save secret');
								}
								await update({ reset: false, invalidateAll: false });
							};
						}}
					>
						<Input
							id="webhook-secret"
							name="secret"
							type={showSecret ? "text" : "password"}
							placeholder={token.webhookSecret ? "••••••••••••" : "Enter HMAC secret..."}
							bind:value={webhookSecretInput}
							class="flex-1 font-mono text-sm"
						/>
						<Button type="submit" variant="outline" size="sm" disabled={!webhookSecretInput.trim()}>Save</Button>
						{#if token.webhookSecret}
							<form
								method="POST"
								action="?/setWebhookSecret"
								use:enhance={() => {
									return async ({ result, update }) => {
										if (result.type === 'success') {
											localToken = { ...token, webhookSecret: null };
											toast.success('Secret cleared');
										}
										await update({ reset: false, invalidateAll: false });
									};
								}}
							>
								<input type="hidden" name="secret" value="" />
								<Button type="submit" variant="ghost" size="sm">Clear</Button>
							</form>
						{/if}
					</form>
					<p class="text-muted-foreground text-xs">Used to verify HMAC-SHA256 signatures from GitHub, Linear, or Stripe.</p>
				</div>

				<!-- How it works -->
				<div class="border-t pt-4">
					<p class="text-muted-foreground mb-3 text-xs font-medium uppercase tracking-wide">How it works</p>
					<ol class="text-muted-foreground grid gap-3 text-sm">
						<li class="flex gap-3">
							<span class="bg-muted text-foreground flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-semibold">1</span>
							<span>
								Set up a webhook in Linear, GitHub, or Stripe pointing to your webhook URL above.
								Replace <span class="font-mono italic">[channel]</span> with a label like <span class="font-mono">linear</span> or <span class="font-mono">github</span>.
							</span>
						</li>
						<li class="flex gap-3">
							<span class="bg-muted text-foreground flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-semibold">2</span>
							<span>
								Your agent polls for events:
								<code class="bg-muted mt-1 block rounded px-2 py-1 text-xs">GET /inbound/pending?channel=linear<br/>Authorization: Bearer sg_...</code>
							</span>
						</li>
						<li class="flex gap-3">
							<span class="bg-muted text-foreground flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-semibold">3</span>
							<span>
								After processing, ack each event:
								<code class="bg-muted mt-1 block rounded px-2 py-1 text-xs">POST /inbound/ack/{'{event_id}'}</code>
							</span>
						</li>
					</ol>
					<p class="text-muted-foreground mt-3 text-xs">Events expire after 24 hours.</p>
				</div>
			</div>
		{/if}
	</div>
</div>
