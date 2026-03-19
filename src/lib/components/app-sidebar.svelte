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
		{
			title: "Integrations",
			items: [{ title: "Connect Agent", url: "/connect" }],
		},
	],
};
</script>

<script lang="ts">
	import { page } from "$app/state";
	import * as Sidebar from "$lib/components/ui/sidebar/index.js";
	import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
	import ShieldCheckIcon from "@lucide/svelte/icons/shield-check";
	import ChevronsUpDownIcon from "@lucide/svelte/icons/chevrons-up-down";
	import type { ComponentProps } from "svelte";

	let {
		user,
		ref = $bindable(null),
		...restProps
	}: ComponentProps<typeof Sidebar.Root> & {
		user: { id: string; email: string } | null;
	} = $props();
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
						<span class="font-semibold">Shellgate</span>
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
				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<Sidebar.MenuButton size="lg" {...props}>
								<div class="bg-sidebar-primary text-sidebar-primary-foreground flex size-8 items-center justify-center rounded-full text-sm font-medium">
									{user?.email?.[0]?.toUpperCase() ?? "?"}
								</div>
								<div class="flex flex-col gap-0.5 leading-none text-left">
									<span class="truncate text-sm font-medium">{user?.email ?? "Unknown"}</span>
								</div>
								<ChevronsUpDownIcon class="ml-auto size-4" />
							</Sidebar.MenuButton>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content side="top" align="start" class="w-[--bits-sidebar-width]">
						<DropdownMenu.Label class="truncate text-xs">{user?.email}</DropdownMenu.Label>
						<DropdownMenu.Separator />
						<DropdownMenu.Item>
							<form method="POST" action="/logout" class="w-full">
								<button type="submit" class="w-full text-left">Log out</button>
							</form>
						</DropdownMenu.Item>
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			</Sidebar.MenuItem>
		</Sidebar.Menu>
	</Sidebar.Footer>
	<Sidebar.Rail />
</Sidebar.Root>
