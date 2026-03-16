<script lang="ts">
import favicon from "$lib/assets/favicon.svg";
import { ModeWatcher } from "mode-watcher";
import { Toaster } from "svelte-sonner";
import "./layout.css";

let { data, children } = $props();
</script>

<ModeWatcher />
<Toaster richColors position="bottom-right" />

<svelte:head>
	<title>{data.title}</title>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}
