<script lang="ts">
import AppSidebar from "$lib/components/app-sidebar.svelte";
import * as Sidebar from "$lib/components/ui/sidebar/index.js";
import * as Tooltip from "$lib/components/ui/tooltip/index.js";
import type { LayoutData } from "./$types";

let { data, children }: { data: LayoutData; children: import("svelte").Snippet } = $props();
</script>

<Sidebar.Provider>
	<AppSidebar user={data.user} />
	<Sidebar.Inset>
		<header class="flex h-16 shrink-0 items-center gap-2 border-b px-4">
			<Sidebar.Trigger class="-ms-1" />
		</header>
		<div class="flex flex-1 flex-col gap-4 p-4">
			<Tooltip.Provider>
				{@render children()}
			</Tooltip.Provider>
		</div>
	</Sidebar.Inset>
</Sidebar.Provider>
