<script lang="ts">
import ShieldCheckIcon from "@lucide/svelte/icons/shield-check";
import type { HTMLAttributes } from "svelte/elements";
import { Button } from "$lib/components/ui/button/index.js";
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
} from "$lib/components/ui/field/index.js";
import { Input } from "$lib/components/ui/input/index.js";
import { cn, type WithElementRef } from "$lib/utils.js";

let {
	ref = $bindable(null),
	class: className,
	error,
	...restProps
}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
	error?: string;
} = $props();

const id = $props.id();
</script>

<div class={cn("flex flex-col gap-6", className)} bind:this={ref} {...restProps}>
	<form method="POST">
		<FieldGroup>
			<div class="flex flex-col items-center gap-2 text-center">
				<div class="flex flex-col items-center gap-2 font-medium">
					<div class="flex size-8 items-center justify-center rounded-md">
						<ShieldCheckIcon class="size-6" />
					</div>
					<span class="sr-only">Shellgate</span>
				</div>
				<h1 class="text-xl font-bold">Create Admin Account</h1>
				<FieldDescription>
					Set up your Shellgate admin account to get started.
				</FieldDescription>
			</div>
			{#if error}
				<div class="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
					{error}
				</div>
			{/if}
			<Field>
				<FieldLabel for="email-{id}">Email</FieldLabel>
				<Input
					id="email-{id}"
					type="email"
					name="email"
					placeholder="admin@example.com"
					required
				/>
			</Field>
			<Field>
				<FieldLabel for="password-{id}">Password</FieldLabel>
				<Input
					id="password-{id}"
					type="password"
					name="password"
					required
					minlength={8}
				/>
			</Field>
			<Field>
				<FieldLabel for="confirm-{id}">Confirm Password</FieldLabel>
				<Input
					id="confirm-{id}"
					type="password"
					name="confirm"
					required
					minlength={8}
				/>
			</Field>
			<Field>
				<Button type="submit" class="w-full">Create Account</Button>
			</Field>
		</FieldGroup>
	</form>
</div>
