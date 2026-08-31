<script lang="ts">
	import { productionState } from '../stateGame.svelte';
</script>

<section aria-label="Production Chef Battle round">
	<p class="final-win">Final win: {productionState.finalWinAtomicUnits}</p>
</section>

<style>
	.final-win {
		margin: 0;
		color: #442d1f;
		font-weight: 800;
	}
</style>
