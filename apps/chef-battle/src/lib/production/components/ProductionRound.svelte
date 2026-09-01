<script lang="ts">
	import { productionState } from '../stateGame.svelte';
	import Board from '../../components/Board.svelte';
	import ModeSummary from './ModeSummary.svelte';
	import PerfectServeBanner from './PerfectServeBanner.svelte';
	import ProductionShowdownOverlay from './ProductionShowdownOverlay.svelte';
	import RecoveryNotice from './RecoveryNotice.svelte';
	import ServiceQueue from './ServiceQueue.svelte';
</script>

<section aria-label="Production Chef Battle round">
	<ModeSummary />
	<p class="round-win">Round ledger: {productionState.roundWinAtomicUnits}</p>
	<p class="cascade">Cascade: {productionState.cascadeIndex}</p>
	<ProductionShowdownOverlay />
	<RecoveryNotice />
	<ServiceQueue />
	<PerfectServeBanner />
	<Board
		board={productionState.board}
		sauceSpots={productionState.activeSauceSpots}
		pastaPullPositionKeys={productionState.pastaPullPositionKeys}
		wokTossPositionKeys={productionState.wokTossPositionKeys}
	/>
	{#if productionState.lastSauceFlightMultiplier > 1}
		<p class="sauce-flight">SAUCE FLIGHT ×{productionState.lastSauceFlightMultiplier}</p>
	{/if}
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
