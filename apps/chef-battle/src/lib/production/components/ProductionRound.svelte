<script lang="ts">
	import { productionState } from '../stateGame.svelte';
</script>

<section aria-label="Production Chef Battle round">
	<p class="round-win">Round ledger: {productionState.roundWinAtomicUnits}</p>
	<p class="cascade">Cascade: {productionState.cascadeIndex}</p>
	<p class="final-win">Final win: {productionState.finalWinAtomicUnits}</p>
</section>

<style>
	.final-win {
		margin: 0;
		color: #442d1f;
		font-weight: 800;
	}

	.round-win,
	.cascade {
		margin: 0 0 0.25rem;
		color: #442d1f;
	}
</style>
