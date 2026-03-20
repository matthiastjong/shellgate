<script lang="ts">
import { enhance } from "$app/forms";
import { goto } from "$app/navigation";
import { page } from "$app/state";
import { toast } from "svelte-sonner";
import { Button } from "$lib/components/ui/button/index.js";
import { Badge } from "$lib/components/ui/badge/index.js";
import * as Table from "$lib/components/ui/table/index.js";
import * as Sheet from "$lib/components/ui/sheet/index.js";
import * as Card from "$lib/components/ui/card/index.js";
import * as Breadcrumb from "$lib/components/ui/breadcrumb/index.js";
import { Input } from "$lib/components/ui/input/index.js";
import { Label } from "$lib/components/ui/label/index.js";
import { Checkbox } from "$lib/components/ui/checkbox/index.js";
import * as Dialog from "$lib/components/ui/dialog/index.js";
import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
import PlusIcon from "@lucide/svelte/icons/plus";
import StarIcon from "@lucide/svelte/icons/star";
import CopyIcon from "@lucide/svelte/icons/copy";
import CheckIcon from "@lucide/svelte/icons/check";
import EllipsisIcon from "@lucide/svelte/icons/ellipsis";
import LoaderCircleIcon from "@lucide/svelte/icons/loader-circle";
import EyeIcon from "@lucide/svelte/icons/eye";
import EyeOffIcon from "@lucide/svelte/icons/eye-off";
import type { PageData } from "./$types";

type Target = {
	id: string;
	name: string;
	slug: string;
	type: string;
	baseUrl: string | null;
	config: { host: string; port: number; username: string } | null;
	enabled: boolean;
	createdAt: string | Date;
	updatedAt: string | Date;
};

type AuthMethod = {
	id: string;
	label: string;
	type: string;
	credentialHint: string | null;
	isDefault: boolean;
	createdAt: string | Date;
};

type TokenAccess = {
	id: string;
	name: string;
	revokedAt: string | Date | null;
	lastUsedAt: string | Date | null;
};

let { data }: { data: PageData } = $props();

let gatewayUrl = $derived(page.url.origin);
let localTarget = $state<Target | null>(null);
let target = $derived<Target>(localTarget ?? (data.target as Target));
let localAuthMethods = $state<AuthMethod[] | null>(null);
let authMethods = $derived<AuthMethod[]>(
	localAuthMethods ?? (data.authMethods as AuthMethod[]),
);
let copied = $state(false);

// Sheet state
let sheetOpen = $state(false);
let sheetMode = $state<
	"rename" | "baseUrl" | "addAuth" | "renameAuth" | "updateCredential"
>("rename");
let sheetSubmitting = $state(false);

// Rename state
let editName = $state("");

// Base URL state
let editBaseUrl = $state("");

// Add auth state
let authLabel = $state("");
let authType = $state("bearer");
let authCredential = $state("");
let showCredential = $state(false);
let isDefaultChecked = $state(true);

// Rename auth state
let renameAuthId = $state("");
let renameAuthLabel = $state("");

// Update credential state
let updateCredentialId = $state("");
let updateCredentialValue = $state("");
let showUpdateCredential = $state(false);

// Delete confirmation
let confirmDeleteAuthId = $state<string | null>(null);

// View credential dialog
let viewCredentialOpen = $state(false);
let viewCredentialLabel = $state("");
let viewCredentialValue = $state("");
let viewCredentialCopied = $state(false);

function openRenameSheet() {
	sheetMode = "rename";
	editName = target.name;
	sheetSubmitting = false;
	sheetOpen = true;
}

function openBaseUrlSheet() {
	sheetMode = "baseUrl";
	editBaseUrl = target.baseUrl ?? "";
	sheetSubmitting = false;
	sheetOpen = true;
}

function openAddAuthSheet() {
	sheetMode = "addAuth";
	authLabel = "";
	authType = target.type === "ssh" ? "ssh_key" : "bearer";
	authCredential = "";
	showCredential = false;
	isDefaultChecked = true;
	sheetSubmitting = false;
	sheetOpen = true;
}

function openRenameAuthSheet(method: AuthMethod) {
	sheetMode = "renameAuth";
	renameAuthId = method.id;
	renameAuthLabel = method.label;
	sheetSubmitting = false;
	sheetOpen = true;
}

function openUpdateCredentialSheet(method: AuthMethod) {
	sheetMode = "updateCredential";
	updateCredentialId = method.id;
	updateCredentialValue = "";
	showUpdateCredential = false;
	sheetSubmitting = false;
	sheetOpen = true;
}

function updateAuthMethods(updater: (methods: AuthMethod[]) => AuthMethod[]) {
	localAuthMethods = updater(authMethods);
}

function formatDate(dateStr: string | Date): string {
	return new Date(dateStr).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}

async function copyToClipboard(text: string) {
	await navigator.clipboard.writeText(text);
	copied = true;
	setTimeout(() => (copied = false), 2000);
}
</script>

<!-- Sheet -->
<Sheet.Root bind:open={sheetOpen}>
	<Sheet.Content side="right">
		{#if sheetMode === 'rename'}
			<Sheet.Header>
				<Sheet.Title>Rename Target</Sheet.Title>
				<Sheet.Description>Update the name for this target.</Sheet.Description>
			</Sheet.Header>
			<form
				method="POST"
				action="?/rename"
				use:enhance={() => {
					sheetSubmitting = true;
					return async ({ result, update }) => {
						sheetSubmitting = false;
						if (result.type === 'success' && result.data?.renamed) {
							const { name, slug: newSlug } = result.data.renamed as { id: string; name: string; slug: string };
							localTarget = { ...target, name, slug: newSlug };
							sheetOpen = false;
							toast.success('Target renamed');
							if (newSlug !== target.slug) {
								goto(`/targets/${newSlug}`);
							}
						} else if (result.type === 'failure') {
							toast.error((result.data?.error as string) ?? 'Failed to rename');
						}
						await update({ reset: false, invalidateAll: false });
					};
				}}
			>
				<input type="hidden" name="id" value={target.id} />
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
		{:else if sheetMode === 'baseUrl'}
			<Sheet.Header>
				<Sheet.Title>Update Base URL</Sheet.Title>
				<Sheet.Description>Change the base URL for this target.</Sheet.Description>
			</Sheet.Header>
			<form
				method="POST"
				action="?/updateBaseUrl"
				use:enhance={() => {
					sheetSubmitting = true;
					return async ({ result, update }) => {
						sheetSubmitting = false;
						if (result.type === 'success' && result.data?.updatedBaseUrl) {
							const { baseUrl } = result.data.updatedBaseUrl as { id: string; baseUrl: string };
							localTarget = { ...target, baseUrl };
							sheetOpen = false;
							toast.success('Base URL updated');
						} else if (result.type === 'failure') {
							toast.error((result.data?.error as string) ?? 'Failed to update');
						}
						await update({ reset: false, invalidateAll: false });
					};
				}}
			>
				<input type="hidden" name="id" value={target.id} />
				<div class="grid gap-4 px-4">
					<div class="grid gap-2">
						<Label for="edit-base-url">Base URL</Label>
						<Input id="edit-base-url" name="base_url" bind:value={editBaseUrl} placeholder="https://api.example.com" required />
					</div>
					<Button type="submit" disabled={sheetSubmitting || !editBaseUrl.trim()}>
						{#if sheetSubmitting}
							<LoaderCircleIcon class="mr-2 size-4 animate-spin" />
						{/if}
						Save
					</Button>
				</div>
			</form>
		{:else if sheetMode === 'addAuth'}
			<Sheet.Header>
				<Sheet.Title>Add Auth Method</Sheet.Title>
				<Sheet.Description>Add a new authentication credential for this target.</Sheet.Description>
			</Sheet.Header>
			<form
				method="POST"
				action="?/addAuthMethod"
				use:enhance={() => {
					sheetSubmitting = true;
					return async ({ result, update }) => {
						sheetSubmitting = false;
						if (result.type === 'success' && result.data?.authMethodAdded) {
							const added = result.data.authMethodAdded as AuthMethod;
							if (added.isDefault) {
								updateAuthMethods((methods) => methods.map((m) => ({ ...m, isDefault: false })).concat(added));
							} else {
								updateAuthMethods((methods) => [...methods, added]);
							}
							sheetOpen = false;
							toast.success('Auth method added');
						} else if (result.type === 'failure') {
							toast.error((result.data?.error as string) ?? 'Failed to add auth method');
						}
						await update({ reset: true, invalidateAll: false });
					};
				}}
			>
				<input type="hidden" name="slug" value={target.slug} />
				<div class="grid gap-4 px-4">
					<div class="grid gap-2">
						<Label for="add-auth-label">Label</Label>
						<Input id="add-auth-label" name="label" bind:value={authLabel} placeholder="e.g. Production Key" required />
					</div>
					<div class="grid gap-2">
						<Label for="add-auth-type">Type</Label>
						<select id="add-auth-type" name="type" bind:value={authType} class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
							{#if target.type === 'ssh'}
								<option value="ssh_key">SSH Key</option>
							{:else}
								<option value="bearer">Bearer Token</option>
								<option value="basic">Basic Auth</option>
								<option value="custom_header">Custom Header</option>
							{/if}
						</select>
					</div>
					{#if authType === 'ssh_key'}
						<div class="grid gap-2">
							<Label for="add-auth-credential">Private Key (PEM)</Label>
							<textarea
								id="add-auth-credential"
								name="credential"
								class="flex min-h-[120px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring font-mono"
								bind:value={authCredential}
								placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;...&#10;-----END OPENSSH PRIVATE KEY-----"
								required
							></textarea>
						</div>
					{:else if authType === 'basic'}
						<div class="grid gap-2">
							<Label for="add-auth-username">Username</Label>
							<Input id="add-auth-username" name="credential1" bind:value={authCredential} placeholder="username" required />
						</div>
						<div class="grid gap-2">
							<Label for="add-auth-password">Password</Label>
							<div class="relative">
								<Input
									id="add-auth-password"
									name="credential2"
									type={showCredential ? 'text' : 'password'}
									placeholder="password"
									required
								/>
								<Button
									type="button"
									variant="ghost"
									size="icon"
									class="absolute right-0 top-0 h-full px-3"
									onclick={() => (showCredential = !showCredential)}
								>
									{#if showCredential}
										<EyeOffIcon class="size-4" />
									{:else}
										<EyeIcon class="size-4" />
									{/if}
								</Button>
							</div>
						</div>
					{:else if authType === 'custom_header'}
						<div class="grid gap-2">
							<Label for="add-auth-header-name">Header Name</Label>
							<Input id="add-auth-header-name" name="credential1" bind:value={authCredential} placeholder="X-API-Key" required />
						</div>
						<div class="grid gap-2">
							<Label for="add-auth-header-value">Header Value</Label>
							<div class="relative">
								<Input
									id="add-auth-header-value"
									name="credential2"
									type={showCredential ? 'text' : 'password'}
									placeholder="your-key-here"
									required
								/>
								<Button
									type="button"
									variant="ghost"
									size="icon"
									class="absolute right-0 top-0 h-full px-3"
									onclick={() => (showCredential = !showCredential)}
								>
									{#if showCredential}
										<EyeOffIcon class="size-4" />
									{:else}
										<EyeIcon class="size-4" />
									{/if}
								</Button>
							</div>
						</div>
					{:else}
						<div class="grid gap-2">
							<Label for="add-auth-credential">Credential</Label>
							<div class="relative">
								<Input
									id="add-auth-credential"
									name="credential"
									type={showCredential ? 'text' : 'password'}
									bind:value={authCredential}
									placeholder="e.g. sk-..."
									required
								/>
								<Button
									type="button"
									variant="ghost"
									size="icon"
									class="absolute right-0 top-0 h-full px-3"
									onclick={() => (showCredential = !showCredential)}
								>
									{#if showCredential}
										<EyeOffIcon class="size-4" />
									{:else}
										<EyeIcon class="size-4" />
									{/if}
								</Button>
							</div>
						</div>
					{/if}
					<div class="flex items-center gap-2">
						<Checkbox id="add-auth-default" name="isDefault" checked={isDefaultChecked} onCheckedChange={(v) => (isDefaultChecked = v === true)} />
						<Label for="add-auth-default" class="text-sm font-normal">Set as default</Label>
					</div>
					<Button type="submit" disabled={sheetSubmitting || !authLabel.trim() || !authCredential}>
						{#if sheetSubmitting}
							<LoaderCircleIcon class="mr-2 size-4 animate-spin" />
						{/if}
						Add Auth Method
					</Button>
				</div>
			</form>
		{:else if sheetMode === 'renameAuth'}
			<Sheet.Header>
				<Sheet.Title>Rename Auth Method</Sheet.Title>
				<Sheet.Description>Update the label for this auth method.</Sheet.Description>
			</Sheet.Header>
			<form
				method="POST"
				action="?/renameAuthMethod"
				use:enhance={() => {
					sheetSubmitting = true;
					return async ({ result, update }) => {
						sheetSubmitting = false;
						if (result.type === 'success' && result.data?.authMethodRenamed) {
							const { id, label } = result.data.authMethodRenamed as { id: string; label: string };
							updateAuthMethods((methods) => methods.map((m) => (m.id === id ? { ...m, label } : m)));
							sheetOpen = false;
							toast.success('Auth method renamed');
						} else if (result.type === 'failure') {
							toast.error((result.data?.error as string) ?? 'Failed to rename');
						}
						await update({ reset: false, invalidateAll: false });
					};
				}}
			>
				<input type="hidden" name="slug" value={target.slug} />
				<input type="hidden" name="id" value={renameAuthId} />
				<div class="grid gap-4 px-4">
					<div class="grid gap-2">
						<Label for="rename-auth-label">Label</Label>
						<Input id="rename-auth-label" name="label" bind:value={renameAuthLabel} required />
					</div>
					<Button type="submit" disabled={sheetSubmitting || !renameAuthLabel.trim()}>
						{#if sheetSubmitting}
							<LoaderCircleIcon class="mr-2 size-4 animate-spin" />
						{/if}
						Save
					</Button>
				</div>
			</form>
		{:else if sheetMode === 'updateCredential'}
			<Sheet.Header>
				<Sheet.Title>Update Credential</Sheet.Title>
				<Sheet.Description>Enter a new credential for this auth method.</Sheet.Description>
			</Sheet.Header>
			<form
				method="POST"
				action="?/updateCredential"
				use:enhance={() => {
					sheetSubmitting = true;
					return async ({ result, update }) => {
						sheetSubmitting = false;
						if (result.type === 'success' && result.data?.credentialUpdated) {
							const { id, credentialHint } = result.data.credentialUpdated as { id: string; credentialHint: string };
							updateAuthMethods((methods) => methods.map((m) => (m.id === id ? { ...m, credentialHint } : m)));
							sheetOpen = false;
							toast.success('Credential updated');
						} else if (result.type === 'failure') {
							toast.error((result.data?.error as string) ?? 'Failed to update credential');
						}
						await update({ reset: false, invalidateAll: false });
					};
				}}
			>
				<input type="hidden" name="slug" value={target.slug} />
				<input type="hidden" name="id" value={updateCredentialId} />
				<div class="grid gap-4 px-4">
					<div class="grid gap-2">
						<Label for="update-credential">New Credential</Label>
						<div class="relative">
							<Input
								id="update-credential"
								name="credential"
								type={showUpdateCredential ? 'text' : 'password'}
								bind:value={updateCredentialValue}
								placeholder="Enter new credential"
								required
							/>
							<Button
								type="button"
								variant="ghost"
								size="icon"
								class="absolute right-0 top-0 h-full px-3"
								onclick={() => (showUpdateCredential = !showUpdateCredential)}
							>
								{#if showUpdateCredential}
									<EyeOffIcon class="size-4" />
								{:else}
									<EyeIcon class="size-4" />
								{/if}
							</Button>
						</div>
					</div>
					<Button type="submit" disabled={sheetSubmitting || !updateCredentialValue}>
						{#if sheetSubmitting}
							<LoaderCircleIcon class="mr-2 size-4 animate-spin" />
						{/if}
						Update Credential
					</Button>
				</div>
			</form>
		{/if}
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
					<Breadcrumb.Link href="/targets">Targets</Breadcrumb.Link>
				</Breadcrumb.Item>
				<Breadcrumb.Separator />
				<Breadcrumb.Item>
					<Breadcrumb.Page>{target.name}</Breadcrumb.Page>
				</Breadcrumb.Item>
			</Breadcrumb.List>
		</Breadcrumb.Root>
		<h1 class="mt-1 text-2xl font-bold tracking-tight">{target.name}</h1>
	</div>

	<div class="grid gap-6 lg:grid-cols-[1fr_400px]">
		<!-- Left column: Target info + Auth methods -->
		<div class="flex flex-col gap-6">
			<!-- Target Info -->
			<div class="rounded-lg border p-6">
				<h2 class="mb-4 text-lg font-semibold">Target Information</h2>
				<dl class="grid gap-4 sm:grid-cols-2">
					<div>
						<dt class="text-muted-foreground text-sm">Name</dt>
						<dd class="flex items-center gap-2">
							<span class="font-medium">{target.name}</span>
							<Button variant="ghost" size="sm" class="h-6 text-xs" onclick={openRenameSheet}>Edit</Button>
						</dd>
					</div>
					<div>
						<dt class="text-muted-foreground text-sm">Type</dt>
						<dd><Badge variant="outline">{target.type}</Badge></dd>
					</div>
					{#if target.type === 'ssh' && target.config}
					<div>
						<dt class="text-muted-foreground text-sm">Host</dt>
						<dd><code class="text-sm font-mono">{target.config.host}:{target.config.port}</code></dd>
					</div>
					<div>
						<dt class="text-muted-foreground text-sm">Username</dt>
						<dd><code class="text-sm font-mono">{target.config.username}</code></dd>
					</div>
				{:else}
					<div>
						<dt class="text-muted-foreground text-sm">Base URL</dt>
						<dd class="flex items-center gap-2">
							{#if target.baseUrl}
								<code class="text-sm font-mono">{target.baseUrl}</code>
							{:else}
								<span class="text-muted-foreground">&mdash;</span>
							{/if}
							<Button variant="ghost" size="sm" class="h-6 text-xs" onclick={openBaseUrlSheet}>Edit</Button>
						</dd>
					</div>
				{/if}
					<div>
						<dt class="text-muted-foreground text-sm">Status</dt>
						<dd class="flex items-center gap-2">
							{#if target.enabled !== false}
								<Badge class="border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300">Active</Badge>
							{:else}
								<Badge variant="secondary">Disabled</Badge>
							{/if}
							<form
								method="POST"
								action="?/toggle"
								use:enhance={() => {
									return async ({ result, update }) => {
										if (result.type === 'success' && result.data?.toggled) {
											const { enabled } = result.data.toggled as { id: string; enabled: boolean };
											localTarget = { ...target, enabled };
											toast.success(enabled ? 'Target enabled' : 'Target disabled');
										} else if (result.type === 'failure') {
											toast.error((result.data?.error as string) ?? 'Failed to toggle');
										}
										await update({ reset: false, invalidateAll: false });
									};
								}}
							>
								<input type="hidden" name="id" value={target.id} />
								<input type="hidden" name="enabled" value={target.enabled !== false ? 'false' : 'true'} />
								<Button type="submit" variant="outline" size="sm" class="h-6 text-xs">
									{target.enabled !== false ? 'Disable' : 'Enable'}
								</Button>
							</form>
						</dd>
					</div>
					<div>
						<dt class="text-muted-foreground text-sm">Created</dt>
						<dd class="text-sm">{formatDate(target.createdAt)}</dd>
					</div>
					<div>
						<dt class="text-muted-foreground text-sm">Updated</dt>
						<dd class="text-sm">{formatDate(target.updatedAt)}</dd>
					</div>
				</dl>
			</div>

			<!-- Auth Methods -->
			<div>
				<div class="mb-4 flex items-center justify-between">
					<h2 class="text-lg font-semibold">Auth Methods</h2>
					<Button size="sm" onclick={openAddAuthSheet}>
						<PlusIcon class="mr-2 size-4" />
						Add Auth Method
					</Button>
				</div>

				{#if authMethods.length === 0}
					<div class="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed py-12">
						<p class="text-muted-foreground text-sm">No auth methods configured for this target.</p>
						<Button size="sm" variant="outline" onclick={openAddAuthSheet}>
							<PlusIcon class="mr-2 size-4" />
							Add Auth Method
						</Button>
					</div>
				{:else}
					<div class="rounded-lg border">
						<Table.Root>
							<Table.Header>
								<Table.Row>
									<Table.Head>Label</Table.Head>
									<Table.Head>Type</Table.Head>
									<Table.Head>Default</Table.Head>
									<Table.Head>Created</Table.Head>
									<Table.Head class="w-12"><span class="sr-only">Actions</span></Table.Head>
								</Table.Row>
							</Table.Header>
							<Table.Body>
								{#each authMethods as method (method.id)}
									{#if confirmDeleteAuthId === method.id}
										<Table.Row class="bg-red-50 dark:bg-red-950/30">
											<Table.Cell colspan={5}>
												<div class="flex items-center justify-between gap-4 py-1">
													<p class="text-sm">Delete this auth method? This cannot be undone.</p>
													<div class="flex shrink-0 gap-2">
														<Button variant="outline" size="sm" onclick={() => (confirmDeleteAuthId = null)}>Cancel</Button>
														<form
															method="POST"
															action="?/deleteAuthMethod"
															use:enhance={() => {
																return async ({ result, update }) => {
																	if (result.type === 'success' && result.data?.authMethodDeleted) {
																		const deletedId = result.data.authMethodDeleted as string;
																		updateAuthMethods((methods) => methods.filter((m) => m.id !== deletedId));
																		confirmDeleteAuthId = null;
																		toast.success('Auth method deleted');
																	} else if (result.type === 'failure') {
																		toast.error((result.data?.error as string) ?? 'Failed to delete');
																	}
																	await update({ reset: false, invalidateAll: false });
																};
															}}
														>
															<input type="hidden" name="slug" value={target.slug} />
															<input type="hidden" name="id" value={method.id} />
															<Button type="submit" variant="destructive" size="sm">Yes, delete</Button>
														</form>
													</div>
												</div>
											</Table.Cell>
										</Table.Row>
									{:else}
										<Table.Row>
											<Table.Cell class="font-medium">{method.label}</Table.Cell>
											<Table.Cell><Badge variant="outline">{method.type === 'ssh_key' ? 'SSH Key' : method.type === 'custom_header' ? 'Custom Header' : method.type === 'basic' ? 'Basic Auth' : 'Bearer'}</Badge></Table.Cell>
											<Table.Cell>
												{#if method.isDefault}
													<StarIcon class="size-4 fill-amber-400 text-amber-400" />
												{/if}
											</Table.Cell>
											<Table.Cell class="text-muted-foreground text-sm">{formatDate(method.createdAt)}</Table.Cell>
											<Table.Cell>
												<form
													method="POST"
													action="?/revealCredential"
													class="hidden"
													id="reveal-credential-form-{method.id}"
													use:enhance={() => {
														return async ({ result, update }) => {
															if (result.type === 'success' && result.data?.revealedCredential) {
																const { credential } = result.data.revealedCredential as { id: string; credential: string };
																viewCredentialLabel = method.label;
																viewCredentialValue = credential;
																viewCredentialCopied = false;
																viewCredentialOpen = true;
															} else if (result.type === 'failure') {
																toast.error((result.data?.error as string) ?? 'Failed to reveal credential');
															}
															await update({ reset: false, invalidateAll: false });
														};
													}}
												>
													<input type="hidden" name="slug" value={target.slug} />
													<input type="hidden" name="id" value={method.id} />
												</form>
												{#if !method.isDefault}
													<form
														method="POST"
														action="?/setDefault"
														class="hidden"
														id="set-default-form-{method.id}"
														use:enhance={() => {
															return async ({ result, update }) => {
																if (result.type === 'success' && result.data?.defaultSet) {
																	const defaultId = result.data.defaultSet as string;
																	updateAuthMethods((methods) =>
																		methods.map((m) => ({ ...m, isDefault: m.id === defaultId }))
																	);
																	toast.success('Default updated');
																} else if (result.type === 'failure') {
																	toast.error((result.data?.error as string) ?? 'Failed to set default');
																}
																await update({ reset: false, invalidateAll: false });
															};
														}}
													>
														<input type="hidden" name="slug" value={target.slug} />
														<input type="hidden" name="id" value={method.id} />
													</form>
												{/if}
												<DropdownMenu.Root>
													<DropdownMenu.Trigger>
														{#snippet child({ props })}
															<Button variant="ghost" size="icon" class="size-8" {...props}>
																<EllipsisIcon class="size-4" />
																<span class="sr-only">Actions</span>
															</Button>
														{/snippet}
													</DropdownMenu.Trigger>
													<DropdownMenu.Content align="end">
														<DropdownMenu.Item onclick={() => (document.getElementById(`reveal-credential-form-${method.id}`) as HTMLFormElement)?.requestSubmit()}>View Credential</DropdownMenu.Item>
														<DropdownMenu.Item onclick={() => openRenameAuthSheet(method)}>Rename</DropdownMenu.Item>
														<DropdownMenu.Item onclick={() => openUpdateCredentialSheet(method)}>Update Credential</DropdownMenu.Item>
														{#if !method.isDefault}
															<DropdownMenu.Item onclick={() => (document.getElementById(`set-default-form-${method.id}`) as HTMLFormElement)?.requestSubmit()}>Set as Default</DropdownMenu.Item>
														{/if}
														<DropdownMenu.Separator />
														<DropdownMenu.Item
															class="text-destructive"
															onclick={() => (confirmDeleteAuthId = method.id)}
														>
															Delete
														</DropdownMenu.Item>
													</DropdownMenu.Content>
												</DropdownMenu.Root>
											</Table.Cell>
										</Table.Row>
									{/if}
								{/each}
							</Table.Body>
						</Table.Root>
					</div>
				{/if}
			</div>

			<!-- API Key Access -->
			<div>
				<div class="mb-4">
					<h2 class="text-lg font-semibold">API Key Access</h2>
				</div>

				{#if (data.tokenAccess as TokenAccess[]).length === 0}
					<div class="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed py-12">
						<p class="text-muted-foreground text-sm">No API keys have access to this target yet.</p>
					</div>
				{:else}
					<div class="rounded-lg border">
						<Table.Root>
							<Table.Header>
								<Table.Row>
									<Table.Head>Key Name</Table.Head>
									<Table.Head>Status</Table.Head>
									<Table.Head>Last used</Table.Head>
								</Table.Row>
							</Table.Header>
							<Table.Body>
								{#each data.tokenAccess as tokenRow (tokenRow.id)}
									{@const ta = tokenRow as TokenAccess}
									<Table.Row>
										<Table.Cell class="font-medium">
											<a href="/api-keys/{ta.id}" class="hover:underline">{ta.name}</a>
										</Table.Cell>
										<Table.Cell>
											{#if ta.revokedAt}
												<Badge variant="secondary">Revoked</Badge>
											{:else}
												<Badge class="border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300">Active</Badge>
											{/if}
										</Table.Cell>
										<Table.Cell class="text-muted-foreground text-sm">
											{ta.lastUsedAt ? formatDate(new Date(ta.lastUsedAt)) : 'Never'}
										</Table.Cell>
									</Table.Row>
								{/each}
							</Table.Body>
						</Table.Root>
					</div>
				{/if}
			</div>
		</div>

		<!-- Right column: Quick Start -->
		<div class="sticky top-4 self-start">
			<Card.Root>
				<Card.Header>
					<Card.Title class="text-sm font-medium">Quick Start</Card.Title>
				</Card.Header>
				<Card.Content>
					<div class="rounded-lg border bg-muted/50 p-3">
						<div class="flex items-start justify-between gap-2">
							{#if target.type === 'ssh'}
								<pre class="break-all font-mono text-xs whitespace-pre-wrap">{`curl -X POST ${gatewayUrl}/ssh/${target.slug}/exec \
  -H "Authorization: Bearer <your-shellgate-token>" \
  -H "Content-Type: application/json" \
  -d '{"command": "whoami"}'`}</pre>
							{:else}
								<pre class="break-all font-mono text-xs whitespace-pre-wrap">{`curl ${gatewayUrl}/gateway/${target.slug}/health \
  -H "Authorization: Bearer <your-shellgate-token>"`}</pre>
							{/if}
							<Button
								variant="ghost"
								size="icon"
								class="size-7 shrink-0"
								onclick={() => {
									if (target.type === 'ssh') {
										copyToClipboard(`curl -X POST ${gatewayUrl}/ssh/${target.slug}/exec \\\n  -H "Authorization: Bearer <your-shellgate-token>" \\\n  -H "Content-Type: application/json" \\\n  -d '{"command": "whoami"}'`);
									} else {
										copyToClipboard(`curl ${gatewayUrl}/gateway/${target.slug}/health \\\n  -H "Authorization: Bearer <your-shellgate-token>"`);
									}
								}}
							>
								{#if copied}
									<CheckIcon class="size-3.5" />
								{:else}
									<CopyIcon class="size-3.5" />
								{/if}
							</Button>
						</div>
					</div>
					{#if target.type === 'ssh'}
						<p class="text-muted-foreground mt-2 text-xs">Replace <code class="font-mono">whoami</code> with any command. Add <code class="font-mono">"timeout": 30</code> for a custom timeout (max 60s).</p>
					{:else}
						<p class="text-muted-foreground mt-2 text-xs">Replace <code class="font-mono">/health</code> with any path your target API supports.</p>
					{/if}
				</Card.Content>
			</Card.Root>
		</div>
	</div>
</div>

<Dialog.Root bind:open={viewCredentialOpen} onOpenChange={(open) => { if (!open) viewCredentialValue = ''; }}>
	<Dialog.Content class="sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title>Credential</Dialog.Title>
			<Dialog.Description>{viewCredentialLabel}</Dialog.Description>
		</Dialog.Header>
		<div class="rounded-lg border bg-muted/50 p-3">
			<pre class="break-all font-mono text-sm whitespace-pre-wrap">{viewCredentialValue}</pre>
		</div>
		<div class="flex justify-end gap-2">
			<Button
				variant="outline"
				size="sm"
				onclick={() => {
					navigator.clipboard.writeText(viewCredentialValue);
					viewCredentialCopied = true;
					setTimeout(() => (viewCredentialCopied = false), 2000);
				}}
			>
				{#if viewCredentialCopied}
					<CheckIcon class="mr-2 size-4" />
					Copied
				{:else}
					<CopyIcon class="mr-2 size-4" />
					Copy
				{/if}
			</Button>
			<Button size="sm" onclick={() => (viewCredentialOpen = false)}>Close</Button>
		</div>
	</Dialog.Content>
</Dialog.Root>
