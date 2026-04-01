<script lang="ts">
import { enhance } from "$app/forms";
import { toast } from "svelte-sonner";
import { Button } from "$lib/components/ui/button/index.js";
import { Badge } from "$lib/components/ui/badge/index.js";
import { Input } from "$lib/components/ui/input/index.js";
import { Label } from "$lib/components/ui/label/index.js";
import { Switch } from "$lib/components/ui/switch/index.js";
import CopyIcon from "@lucide/svelte/icons/copy";
import PlusIcon from "@lucide/svelte/icons/plus";
import LoaderCircleIcon from "@lucide/svelte/icons/loader-circle";

type Target = { id: string; name: string; slug: string; type: string; baseUrl: string | null; enabled: boolean };
type AgentType = "openclaw" | "hermes" | "claude-code" | "custom";

let {
	mode,
	targets,
	gatewayUrl,
	actionUrl,
	onComplete,
}: {
	mode: "onboarding" | "modal";
	targets: Target[];
	gatewayUrl: string;
	actionUrl: string;
	onComplete?: () => void;
} = $props();

// Local target list (updated inline when step 3 creates one)
let localTargets = $state<Target[]>([...targets]);

// Onboarding: 1=select agent, 2=name key, 4=install (skip step 3)
// Modal: 1=select agent, 2=name key, 3=select targets, 4=install
let step = $state(1);
let selectedAgent = $state<AgentType | null>(null);
let newKeyName = $state("");
let selectedTargetIds = $state<Set<string>>(new Set());
let createdToken = $state<string | null>(null);
let submitting = $state(false);

// Inline target creation state (step 3, modal only)
let targetSubmitting = $state(false);
let showInlineTargetCreate = $state(false);

let agentDisplayName = $derived(
	selectedAgent === "openclaw" ? "OpenClaw"
	: selectedAgent === "hermes" ? "Hermes"
	: selectedAgent === "claude-code" ? "Claude Code"
	: selectedAgent === "custom" ? "Custom"
	: ""
);

// Onboarding skips target selection: 3 steps shown
// Modal keeps all 4 steps
let totalSteps = $derived(mode === "onboarding" ? 3 : 4);
let displayStep = $derived(mode === "onboarding" && step === 4 ? 3 : step);

let hasTargetsOnKey = $derived(selectedTargetIds.size > 0);

function getCtaLabel(): string {
	if (mode === "onboarding") {
		return "Create your first target";
	}
	return hasTargetsOnKey ? "Done" : "Create a target";
}

function getCtaAction(): string | undefined {
	if (mode === "onboarding") {
		return "/targets";
	}
	return undefined;
}

function handleCtaClick() {
	if (mode === "modal") {
		if (!hasTargetsOnKey) {
			window.location.href = "/targets";
		} else {
			onComplete?.();
		}
	}
}

function handleCreateKey() {
	submitting = true;
	return async ({ result, update }: any) => {
		submitting = false;
		if (result.type === "success" && result.data?.created) {
			const created = result.data.created as { plainToken: string };
			createdToken = created.plainToken;
			if (result.data.warning) {
				toast.warning(result.data.warning as string);
			}
			step = 4;
			toast.success("API key created");
		} else if (result.type === "failure") {
			toast.error((result.data?.error as string) ?? "Failed to create key");
		}
		await update({ reset: false, invalidateAll: false });
	};
}

async function copyToClipboard(text: string | null) {
	if (!text) return;
	try {
		await navigator.clipboard.writeText(text);
		toast.success("Copied!");
	} catch {
		toast.error("Failed to copy");
	}
}
</script>

<div class="space-y-6">
	<!-- Step indicator -->
	<div class="flex items-center justify-center gap-2">
		{#each Array(totalSteps) as _, i}
			<div class="size-2 rounded-full transition-colors
				{i + 1 === displayStep ? 'bg-primary' : i + 1 < displayStep ? 'bg-primary/50' : 'bg-muted'}"></div>
		{/each}
		<span class="text-muted-foreground text-xs ml-2">Step {displayStep} of {totalSteps}</span>
	</div>

	<!-- Step 1: Select agent -->
	{#if step === 1}
		<div class="space-y-6">
			<h2 class="text-center font-semibold">What agent are you connecting?</h2>
			<div class="grid grid-cols-2 gap-3">
				<button
					class="flex flex-col items-center gap-3 rounded-lg border-2 p-6 transition-colors
						{selectedAgent === 'openclaw' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'}"
					onclick={() => (selectedAgent = "openclaw")}
				>
					<img src="/openclaw.png" alt="OpenClaw" class="size-10" />
					<div class="text-center">
						<div class="font-semibold">OpenClaw</div>
						<div class="text-muted-foreground text-xs">AI assistant platform</div>
					</div>
				</button>

				<button
					class="flex flex-col items-center gap-3 rounded-lg border-2 p-6 transition-colors
						{selectedAgent === 'hermes' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'}"
					onclick={() => (selectedAgent = "hermes")}
				>
					<img src="/hermes.svg" alt="Hermes" class="size-10" onerror={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling.style.display = 'flex'; }} />
					<div class="size-10 items-center justify-center rounded-full bg-violet-100 dark:bg-violet-900 text-violet-600 dark:text-violet-300 font-bold text-lg hidden">H</div>
					<div class="text-center">
						<div class="font-semibold">Hermes</div>
						<div class="text-muted-foreground text-xs">Nous Research agent</div>
					</div>
				</button>
				<button
					class="flex flex-col items-center gap-3 rounded-lg border-2 p-6 transition-colors
						{selectedAgent === 'claude-code' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'}"
					onclick={() => (selectedAgent = "claude-code")}
				>
					<img src="/claude.svg" alt="Claude Code" class="size-10" />
					<div class="text-center">
						<div class="font-semibold">Claude Code</div>
						<div class="text-muted-foreground text-xs">Anthropic's coding agent</div>
					</div>
				</button>
				<button
					class="flex flex-col items-center gap-3 rounded-lg border-2 p-6 transition-colors
						{selectedAgent === 'custom' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'}"
					onclick={() => (selectedAgent = "custom")}
				>
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" class="size-10 text-muted-foreground/50" fill="currentColor"><path d="M392.8 65.2C375.8 60.3 358.1 70.2 353.2 87.2L225.2 535.2C220.3 552.2 230.2 569.9 247.2 574.8C264.2 579.7 281.9 569.8 286.8 552.8L414.8 104.8C419.7 87.8 409.8 70.1 392.8 65.2zM457.4 201.3C444.9 213.8 444.9 234.1 457.4 246.6L530.8 320L457.4 393.4C444.9 405.9 444.9 426.2 457.4 438.7C469.9 451.2 490.2 451.2 502.7 438.7L598.7 342.7C611.2 330.2 611.2 309.9 598.7 297.4L502.7 201.4C490.2 188.9 469.9 188.9 457.4 201.4zM182.7 201.3C170.2 188.8 149.9 188.8 137.4 201.3L41.4 297.3C28.9 309.8 28.9 330.1 41.4 342.6L137.4 438.6C149.9 451.1 170.2 451.1 182.7 438.6C195.2 426.1 195.2 405.8 182.7 393.3L109.3 320L182.6 246.6C195.1 234.1 195.1 213.8 182.6 201.3z"/></svg>
					<div class="text-center">
						<div class="font-semibold">Custom</div>
						<div class="text-muted-foreground text-xs">Use the API directly</div>
					</div>
				</button>
			</div>
			<div class="flex justify-center">
				<Button disabled={!selectedAgent} onclick={() => {
					newKeyName = selectedAgent === "custom" ? "API Key" : `${agentDisplayName} Agent`;
					step = 2;
				}}>
					Next
				</Button>
			</div>
		</div>

	<!-- Step 2: Name API key -->
	{:else if step === 2}
		<div class="space-y-6">
			<h2 class="text-center font-semibold">Create an API key for {agentDisplayName}</h2>
			<p class="text-muted-foreground text-sm text-center">Each agent should have its own API key so you can manage access independently.</p>

			<div class="space-y-4">
				<div class="space-y-2">
					<Label for="key-name">Key name</Label>
					<Input id="key-name" bind:value={newKeyName} placeholder="e.g. Claude Code Agent" />
				</div>

				<div class="flex justify-between pt-2">
					<Button variant="outline" onclick={() => (step = 1)}>Back</Button>
					{#if mode === "onboarding"}
						<form
							method="POST"
							action="{actionUrl}?/createKey"
							use:enhance={handleCreateKey}
						>
							<input type="hidden" name="name" value={newKeyName} />
							<input type="hidden" name="targetIds" value="" />
							<input type="hidden" name="agent" value={selectedAgent} />
							<Button type="submit" disabled={!newKeyName.trim() || submitting}>
								{#if submitting}
									<LoaderCircleIcon class="mr-2 size-4 animate-spin" />
								{/if}
								Next
							</Button>
						</form>
					{:else}
						<Button disabled={!newKeyName.trim()} onclick={() => (step = 3)}>
							Next
						</Button>
					{/if}
				</div>
			</div>
		</div>

	<!-- Step 3: Select targets (modal only) -->
	{:else if step === 3}
		<div class="space-y-6">
			<h2 class="text-center font-semibold">Select targets</h2>
			<p class="text-muted-foreground text-sm text-center">Choose which targets this API key can access.</p>

			<div class="space-y-4">
				{#if localTargets.length > 0}
					<div class="space-y-2">
						{#each localTargets as target (target.id)}
							<div class="flex items-center justify-between rounded-lg border p-3">
								<div class="flex flex-col gap-0.5">
									<div class="flex items-center gap-2">
										<span class="text-sm font-medium">{target.name}</span>
										<Badge variant="outline" class="text-xs">{target.type}</Badge>
									</div>
									{#if target.baseUrl}
										<span class="text-muted-foreground text-xs font-mono">{target.baseUrl}</span>
									{/if}
								</div>
								<Switch
									checked={selectedTargetIds.has(target.id)}
									onCheckedChange={() => {
										const next = new Set(selectedTargetIds);
										next.has(target.id) ? next.delete(target.id) : next.add(target.id);
										selectedTargetIds = next;
									}}
								/>
							</div>
						{/each}
					</div>
				{:else}
					{#if !showInlineTargetCreate}
						<div class="flex flex-col items-center gap-3 rounded-lg border border-dashed p-8">
							<p class="text-muted-foreground text-sm">No targets yet. Create one so your agent has something to connect to.</p>
							<Button onclick={() => (showInlineTargetCreate = true)}>
								<PlusIcon class="mr-1.5 size-3.5" />
								Create a target
							</Button>
						</div>
					{:else}
						<form
							method="POST"
							action="{actionUrl}?/createTarget"
							use:enhance={() => {
								targetSubmitting = true;
								return async ({ result, update }) => {
									targetSubmitting = false;
									if (result.type === "success" && result.data?.created) {
										const created = result.data.created as Target;
										localTargets = [...localTargets, created];
										selectedTargetIds = new Set([...selectedTargetIds, created.id]);
										showInlineTargetCreate = false;
										toast.success("Target created");
									} else if (result.type === "failure") {
										toast.error((result.data?.error as string) ?? "Failed to create target");
									}
									await update({ reset: true, invalidateAll: false });
								};
							}}
						>
							<div class="space-y-3 rounded-lg border p-4">
								<p class="text-sm font-medium">New target</p>
								<div class="space-y-2">
									<Label for="inline-target-name">Name</Label>
									<Input id="inline-target-name" name="name" placeholder="e.g. OpenAI API" required />
								</div>
								<div class="space-y-2">
									<Label for="inline-target-url">Base URL</Label>
									<Input id="inline-target-url" name="base_url" placeholder="e.g. https://api.openai.com" required />
								</div>
								<div class="flex gap-2">
									<Button variant="outline" type="button" onclick={() => (showInlineTargetCreate = false)}>Cancel</Button>
									<Button type="submit" class="flex-1" disabled={targetSubmitting}>
										{#if targetSubmitting}
											<LoaderCircleIcon class="mr-2 size-4 animate-spin" />
										{/if}
										Create
									</Button>
								</div>
							</div>
						</form>
					{/if}

					<div class="flex justify-between pt-2">
						<Button variant="outline" onclick={() => (step = 2)}>Back</Button>
						<form
							method="POST"
							action="{actionUrl}?/createKey"
							use:enhance={handleCreateKey}
						>
							<input type="hidden" name="name" value={newKeyName} />
							<input type="hidden" name="targetIds" value="" />
							<input type="hidden" name="agent" value={selectedAgent} />
							<Button type="submit" variant="ghost" disabled={submitting}>
								{#if submitting}
									<LoaderCircleIcon class="mr-2 size-4 animate-spin" />
								{/if}
								Skip
							</Button>
						</form>
					</div>
				{/if}

				{#if localTargets.length > 0}
				<div class="flex justify-between pt-2">
					<Button variant="outline" onclick={() => (step = 2)}>Back</Button>
					<form
						method="POST"
						action="{actionUrl}?/createKey"
						use:enhance={handleCreateKey}
					>
						<input type="hidden" name="name" value={newKeyName} />
						<input type="hidden" name="targetIds" value={[...selectedTargetIds].join(",")} />
						<input type="hidden" name="agent" value={selectedAgent} />
						<Button type="submit" disabled={submitting}>
							{#if submitting}
								<LoaderCircleIcon class="mr-2 size-4 animate-spin" />
							{/if}
							Create Key
						</Button>
					</form>
				</div>
				{/if}
			</div>
		</div>

	<!-- Step 4: Install agent -->
	{:else if step === 4}
		<div class="space-y-6">
			<h2 class="text-center font-semibold">Connect {agentDisplayName} to Shellgate</h2>

			{#if createdToken}
				{#if selectedAgent === "claude-code"}
					{@const installCmd = `curl -sX POST ${gatewayUrl}/api/install/claude-code -H "Content-Type: application/json" -d '{"token":"${createdToken}"}' | bash`}
					<div class="space-y-2">
						<p class="text-sm font-medium">Run this in your terminal:</p>
						<div class="rounded-lg bg-muted p-4 font-mono text-sm">
							<div class="flex items-start justify-between gap-2">
								<pre class="break-all whitespace-pre-wrap">{installCmd}</pre>
								<Button variant="ghost" size="sm" class="shrink-0" onclick={() => copyToClipboard(installCmd)}>
									<CopyIcon class="size-3.5" />
								</Button>
							</div>
						</div>
					</div>

					<div class="rounded-lg border bg-muted/30 p-4 text-sm space-y-1">
						<p class="text-muted-foreground">This will:</p>
						<ul class="text-muted-foreground list-disc list-inside space-y-0.5">
							<li>Verify your API key works</li>
							<li>Configure Claude Code environment variables</li>
							<li>Install the Shellgate skill</li>
						</ul>
					</div>
				{:else if selectedAgent === "hermes"}
					{@const installCmd = `curl -sX POST ${gatewayUrl}/api/install/hermes -H "Content-Type: application/json" -d '{"token":"${createdToken}"}' | bash`}
					<div class="space-y-2">
						<p class="text-sm font-medium">Run this in your terminal:</p>
						<div class="rounded-lg bg-muted p-4 font-mono text-sm">
							<div class="flex items-start justify-between gap-2">
								<pre class="break-all whitespace-pre-wrap">{installCmd}</pre>
								<Button variant="ghost" size="sm" class="shrink-0" onclick={() => copyToClipboard(installCmd)}>
									<CopyIcon class="size-3.5" />
								</Button>
							</div>
						</div>
					</div>

					<div class="rounded-lg border bg-muted/30 p-4 text-sm space-y-1">
						<p class="text-muted-foreground">This will:</p>
						<ul class="text-muted-foreground list-disc list-inside space-y-0.5">
							<li>Verify your API key works</li>
							<li>Configure Hermes environment variables</li>
							<li>Install the Shellgate skill</li>
							<li>Restart the Hermes gateway</li>
						</ul>
					</div>
				{:else if selectedAgent === "openclaw"}
					{@const installCmd = `curl -sX POST ${gatewayUrl}/api/install/openclaw -H "Content-Type: application/json" -d '{"token":"${createdToken}"}' | bash`}
					<div class="space-y-2">
						<p class="text-sm font-medium">Run this in your terminal:</p>
						<div class="rounded-lg bg-muted p-4 font-mono text-sm">
							<div class="flex items-start justify-between gap-2">
								<pre class="break-all whitespace-pre-wrap">{installCmd}</pre>
								<Button variant="ghost" size="sm" class="shrink-0" onclick={() => copyToClipboard(installCmd)}>
									<CopyIcon class="size-3.5" />
								</Button>
							</div>
						</div>
					</div>

					<div class="rounded-lg border bg-muted/30 p-4 text-sm space-y-1">
						<p class="text-muted-foreground">This will:</p>
						<ul class="text-muted-foreground list-disc list-inside space-y-0.5">
							<li>Verify your API key works</li>
							<li>Configure OpenClaw environment variables</li>
							<li>Install the Shellgate skill</li>
							<li>Restart the OpenClaw gateway</li>
						</ul>
					</div>
				{:else}
					<div class="rounded-lg border bg-muted/50 p-4 font-mono text-sm space-y-3">
						<div class="flex items-start justify-between gap-2">
							<span class="break-all">SHELLGATE_URL=<span class="text-primary">{gatewayUrl}</span></span>
							<Button variant="ghost" size="sm" class="shrink-0" onclick={() => copyToClipboard(gatewayUrl)}>
								<CopyIcon class="size-3.5" />
							</Button>
						</div>
						<div class="flex items-start justify-between gap-2">
							<span class="break-all">SHELLGATE_API_KEY=<span class="text-primary">{createdToken}</span></span>
							<Button variant="ghost" size="sm" class="shrink-0" onclick={() => copyToClipboard(createdToken)}>
								<CopyIcon class="size-3.5" />
							</Button>
						</div>
					</div>

					<Button variant="outline" class="w-full" onclick={() => copyToClipboard(`SHELLGATE_URL=${gatewayUrl}\nSHELLGATE_API_KEY=${createdToken}`)}>
						<CopyIcon class="mr-2 size-3.5" />
						Copy all
					</Button>

					<div class="rounded-lg border-2 border-dashed border-primary/30 bg-primary/5 p-6 space-y-4">
						<h3 class="font-medium text-sm">Verify the connection</h3>
						<p class="text-sm text-muted-foreground">Test the connection:</p>
						<div class="rounded-lg bg-muted p-4 font-mono text-sm">
							<div class="flex items-start justify-between gap-2">
								<span class="break-all">curl -s -H "Authorization: Bearer $SHELLGATE_API_KEY" $SHELLGATE_URL/verify-connection</span>
								<Button variant="ghost" size="sm" class="shrink-0" onclick={() => copyToClipboard('curl -s -H "Authorization: Bearer $SHELLGATE_API_KEY" $SHELLGATE_URL/verify-connection')}>
									<CopyIcon class="size-3.5" />
								</Button>
							</div>
						</div>
					</div>
				{/if}

				<div class="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950">
					<p class="text-sm text-amber-700 dark:text-amber-300">
						⚠️ Save your API key now — it won't be shown again.
					</p>
				</div>
			{/if}

			<div class="flex justify-between pt-2">
				<Button variant="outline" onclick={() => (step = mode === "onboarding" ? 2 : 3)}>Back</Button>
				{#if getCtaAction()}
					<Button href={getCtaAction()}>{getCtaLabel()}</Button>
				{:else}
					<Button onclick={handleCtaClick}>{getCtaLabel()}</Button>
				{/if}
			</div>
		</div>
	{/if}
</div>
