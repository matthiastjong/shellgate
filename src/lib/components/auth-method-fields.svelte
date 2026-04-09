<script lang="ts">
import { Input } from "$lib/components/ui/input/index.js";
import { Label } from "$lib/components/ui/label/index.js";
import { Button } from "$lib/components/ui/button/index.js";
import EyeIcon from "@lucide/svelte/icons/eye";
import EyeOffIcon from "@lucide/svelte/icons/eye-off";
import PlusIcon from "@lucide/svelte/icons/plus";
import TrashIcon from "@lucide/svelte/icons/trash-2";

type Props = {
	targetType: string;
	mode?: 'add' | 'edit';
	authType?: string;
	idPrefix?: string;
};

let { targetType, mode = 'add', authType = $bindable('bearer'), idPrefix = 'auth' }: Props = $props();

let showCredential = $state(false);
let authCredential = $state("");
let customHeaders = $state<{ name: string; value: string }[]>([{ name: "", value: "" }]);

// JWT ES256 state
let jwtPrivateKey = $state("");
let jwtKeyId = $state("");
let jwtIssuerId = $state("");
let jwtAudience = $state("");
let jwtExpiresIn = $state("");

// OAuth2 Refresh Token state
let oauth2ClientId = $state("");
let oauth2ClientSecret = $state("");
let oauth2RefreshToken = $state("");
let oauth2TokenUrl = $state("");

const optionalHint = mode === 'edit' ? ' (leave blank to keep existing)' : '';
</script>

<div class="grid gap-2">
	<Label for="{idPrefix}-type">Type</Label>
	<select id="{idPrefix}-type" name="type" bind:value={authType} class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
		{#if targetType === 'ssh'}
			<option value="ssh_key">SSH Key</option>
		{:else}
			<option value="bearer">Bearer Token</option>
			<option value="basic">Basic Auth</option>
			<option value="custom_header">Custom Header</option>
			<option value="query_param">Query Parameter</option>
			<option value="jwt_es256">JWT ES256 (Apple, etc.)</option>
			<option value="oauth2_refresh_token">OAuth2 Refresh Token (Google, etc.)</option>
		{/if}
	</select>
</div>

{#if authType === 'ssh_key'}
	<div class="grid gap-2">
		<Label for="{idPrefix}-credential">Private Key (PEM){#if mode === 'edit'} <span class="text-muted-foreground text-xs">{optionalHint}</span>{/if}</Label>
		<textarea
			id="{idPrefix}-credential"
			name="credential"
			class="flex min-h-[120px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring font-mono"
			bind:value={authCredential}
			placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;...&#10;-----END OPENSSH PRIVATE KEY-----"
			required={mode === 'add'}
		></textarea>
	</div>
{:else if authType === 'basic'}
	<div class="grid gap-2">
		<Label for="{idPrefix}-username">Username{#if mode === 'edit'} <span class="text-muted-foreground text-xs">{optionalHint}</span>{/if}</Label>
		<Input id="{idPrefix}-username" name="credential1" bind:value={authCredential} placeholder="username" required={mode === 'add'} />
	</div>
	<div class="grid gap-2">
		<Label for="{idPrefix}-password">Password</Label>
		<div class="relative">
			<Input
				id="{idPrefix}-password"
				name="credential2"
				type={showCredential ? 'text' : 'password'}
				placeholder="password"
				required={mode === 'add'}
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
		<div class="flex items-center justify-between">
			<Label>Headers{#if mode === 'edit'} <span class="text-muted-foreground text-xs">{optionalHint}</span>{/if}</Label>
			<Button
				type="button"
				variant="ghost"
				size="sm"
				class="h-7 text-xs"
				onclick={() => (showCredential = !showCredential)}
			>
				{#if showCredential}
					<EyeOffIcon class="mr-1 size-3" /> Hide values
				{:else}
					<EyeIcon class="mr-1 size-3" /> Show values
				{/if}
			</Button>
		</div>
		{#each customHeaders as header, i}
			<div class="flex gap-2 items-start">
				<Input name="headerName" bind:value={header.name} placeholder="X-API-Key" required={mode === 'add'} class="flex-1" />
				<div class="relative flex-1">
					<Input name="headerValue" type={showCredential ? 'text' : 'password'} bind:value={header.value} placeholder="value" required={mode === 'add'} />
				</div>
				{#if customHeaders.length > 1}
					<Button type="button" variant="ghost" size="icon" class="h-9 w-9 shrink-0" onclick={() => { customHeaders = customHeaders.filter((_, j) => j !== i); }}>
						<TrashIcon class="size-4" />
					</Button>
				{/if}
			</div>
		{/each}
		<Button type="button" variant="outline" size="sm" class="w-full" onclick={() => { customHeaders = [...customHeaders, { name: "", value: "" }]; }}>
			<PlusIcon class="mr-2 size-4" /> Add Header
		</Button>
	</div>
{:else if authType === 'query_param'}
	<div class="grid gap-2">
		<Label for="{idPrefix}-param-name">Parameter Name{#if mode === 'edit'} <span class="text-muted-foreground text-xs">{optionalHint}</span>{/if}</Label>
		<Input id="{idPrefix}-param-name" name="credential1" bind:value={authCredential} placeholder="key" required={mode === 'add'} />
	</div>
	<div class="grid gap-2">
		<Label for="{idPrefix}-param-value">Parameter Value</Label>
		<div class="relative">
			<Input
				id="{idPrefix}-param-value"
				name="credential2"
				type={showCredential ? 'text' : 'password'}
				placeholder="your-api-key"
				required={mode === 'add'}
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
{:else if authType === 'jwt_es256'}
	<div class="grid gap-2">
		<Label for="{idPrefix}-jwt-private-key">Private Key (PEM){#if mode === 'edit'} <span class="text-muted-foreground text-xs">{optionalHint}</span>{/if}</Label>
		<textarea
			id="{idPrefix}-jwt-private-key"
			name="jwtPrivateKey"
			class="flex min-h-[120px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring font-mono"
			bind:value={jwtPrivateKey}
			placeholder="-----BEGIN PRIVATE KEY-----&#10;...&#10;-----END PRIVATE KEY-----"
			required={mode === 'add'}
		></textarea>
	</div>
	<div class="grid gap-2">
		<Label for="{idPrefix}-jwt-key-id">Key ID{#if mode === 'edit'} <span class="text-muted-foreground text-xs">{optionalHint}</span>{/if}</Label>
		<Input id="{idPrefix}-jwt-key-id" name="jwtKeyId" bind:value={jwtKeyId} placeholder="e.g. ABC123XYZ" required={mode === 'add'} />
	</div>
	<div class="grid gap-2">
		<Label for="{idPrefix}-jwt-issuer-id">Issuer ID{#if mode === 'edit'} <span class="text-muted-foreground text-xs">{optionalHint}</span>{/if}</Label>
		<Input id="{idPrefix}-jwt-issuer-id" name="jwtIssuerId" bind:value={jwtIssuerId} placeholder="e.g. 69a6de12-..." required={mode === 'add'} />
	</div>
	<div class="grid gap-2">
		<Label for="{idPrefix}-jwt-audience">Audience <span class="text-muted-foreground text-xs">(optional)</span></Label>
		<Input id="{idPrefix}-jwt-audience" name="jwtAudience" bind:value={jwtAudience} placeholder="appstoreconnect-v1 (default)" />
	</div>
	<div class="grid gap-2">
		<Label for="{idPrefix}-jwt-expires-in">Expires In (seconds) <span class="text-muted-foreground text-xs">(optional)</span></Label>
		<Input id="{idPrefix}-jwt-expires-in" name="jwtExpiresIn" type="number" bind:value={jwtExpiresIn} placeholder="1200 (default)" />
	</div>
{:else if authType === 'oauth2_refresh_token'}
	<div class="grid gap-2">
		<Label for="{idPrefix}-oauth2-client-id">Client ID{#if mode === 'edit'} <span class="text-muted-foreground text-xs">{optionalHint}</span>{/if}</Label>
		<Input id="{idPrefix}-oauth2-client-id" name="oauth2ClientId" bind:value={oauth2ClientId} placeholder="e.g. 123456789.apps.googleusercontent.com" required={mode === 'add'} />
	</div>
	<div class="grid gap-2">
		<Label for="{idPrefix}-oauth2-client-secret">Client Secret{#if mode === 'edit'} <span class="text-muted-foreground text-xs">{optionalHint}</span>{/if}</Label>
		<div class="relative">
			<Input
				id="{idPrefix}-oauth2-client-secret"
				name="oauth2ClientSecret"
				type={showCredential ? 'text' : 'password'}
				bind:value={oauth2ClientSecret}
				placeholder="GOCSPX-..."
				required={mode === 'add'}
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
	<div class="grid gap-2">
		<Label for="{idPrefix}-oauth2-refresh-token">Refresh Token{#if mode === 'edit'} <span class="text-muted-foreground text-xs">{optionalHint}</span>{/if}</Label>
		<div class="relative">
			<Input
				id="{idPrefix}-oauth2-refresh-token"
				name="oauth2RefreshToken"
				type={showCredential ? 'text' : 'password'}
				bind:value={oauth2RefreshToken}
				placeholder="1//0..."
				required={mode === 'add'}
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
	<div class="grid gap-2">
		<Label for="{idPrefix}-oauth2-token-url">Token URL <span class="text-muted-foreground text-xs">(optional, defaults to Google)</span></Label>
		<Input id="{idPrefix}-oauth2-token-url" name="oauth2TokenUrl" bind:value={oauth2TokenUrl} placeholder="https://oauth2.googleapis.com/token" />
	</div>
{:else}
	<div class="grid gap-2">
		<Label for="{idPrefix}-credential">Credential{#if mode === 'edit'} <span class="text-muted-foreground text-xs">{optionalHint}</span>{/if}</Label>
		<div class="relative">
			<Input
				id="{idPrefix}-credential"
				name="credential"
				type={showCredential ? 'text' : 'password'}
				bind:value={authCredential}
				placeholder="e.g. sk-..."
				required={mode === 'add'}
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
