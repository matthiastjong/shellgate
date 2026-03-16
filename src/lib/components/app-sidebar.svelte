<script lang="ts" module>
const data = {
	navMain: [
		{
			title: "Overview",
			items: [{ title: "Dashboard", url: "/" }],
		},
		{
			title: "Gateway",
			items: [{ title: "Targets", url: "/targets" }],
		},
		{
			title: "Security",
			items: [{ title: "API Keys", url: "/api-keys" }],
		},
	],
};
</script>

<script lang="ts">
	import { page } from "$app/state";
	import * as Sidebar from "$lib/components/ui/sidebar/index.js";
	import ShieldCheckIcon from "@lucide/svelte/icons/shield-check";
	import type { ComponentProps } from "svelte";

	let {
		ref = $bindable(null),
		...restProps
	}: ComponentProps<typeof Sidebar.Root> = $props();
</script>

<Sidebar.Root {...restProps} bind:ref>
	<Sidebar.Header>
		<Sidebar.Menu>
			<Sidebar.MenuItem>
				<Sidebar.MenuButton size="lg">
					<div
						class="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg"
					>
						<ShieldCheckIcon class="size-4" />
					</div>
					<div class="flex flex-col gap-0.5 leading-none">
						<span class="font-semibold">ShellGate</span>
						<span class="text-xs">Dashboard</span>
					</div>
				</Sidebar.MenuButton>
			</Sidebar.MenuItem>
		</Sidebar.Menu>
	</Sidebar.Header>
	<Sidebar.Content>
		{#each data.navMain as group (group.title)}
			<Sidebar.Group>
				<Sidebar.GroupLabel>{group.title}</Sidebar.GroupLabel>
				<Sidebar.GroupContent>
					<Sidebar.Menu>
						{#each group.items as item (item.title)}
							<Sidebar.MenuItem>
								<Sidebar.MenuButton isActive={item.url === "/" ? page.url.pathname === "/" : page.url.pathname.startsWith(item.url)}>
									{#snippet child({ props })}
										<a href={item.url} {...props}>{item.title}</a>
									{/snippet}
								</Sidebar.MenuButton>
							</Sidebar.MenuItem>
						{/each}
					</Sidebar.Menu>
				</Sidebar.GroupContent>
			</Sidebar.Group>
		{/each}
	</Sidebar.Content>
	<Sidebar.Footer>
		<Sidebar.Menu>
			<Sidebar.MenuItem>
				<form method="POST" action="/logout" class="w-full">
					<Sidebar.MenuButton type="submit" class="w-full">
						Logout
					</Sidebar.MenuButton>
				</form>
			</Sidebar.MenuItem>
		</Sidebar.Menu>
	</Sidebar.Footer>
	<Sidebar.Rail />
</Sidebar.Root>
