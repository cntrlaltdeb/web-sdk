<script lang="ts">
	import { productionState } from '../stateGame.svelte';
</script>

{#if productionState.perfectServePayoutAtomicUnits !== null}
	<p>Perfect Serve: {productionState.perfectServePayoutAtomicUnits}</p>
{/if}
