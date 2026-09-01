<script lang="ts">
	import { productionState } from '../stateGame.svelte';

	const chefNames = {
		italian: 'Italian',
		french: 'French',
		chinese: 'Chinese',
	} as const;
</script>

{#if productionState.serviceQueue.length > 0}
	<section aria-label="Service Queue">
		{#each productionState.serviceQueue as entry (entry.id)}
			<p>{chefNames[entry.chef]} READY</p>
		{/each}
	</section>
{/if}
