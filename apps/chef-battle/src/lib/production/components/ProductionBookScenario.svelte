<script lang="ts">
	import { loadPreparedProductionBook, loadProductionCheckpoint } from '../localBookAdapter';
	import { playPreparedProductionBook, resumeProductionBook } from '../playback';
	import { productionState } from '../stateGame.svelte';
	import type { ProductionScenarioId } from '../typesBookEvent';
	import ProductionRound from './ProductionRound.svelte';

	let { roundId }: { roundId: ProductionScenarioId } = $props();

	$effect(() => {
		let cancelled = false;
		const controller = new AbortController();
		void (async () => {
			try {
				const book = await loadPreparedProductionBook(roundId);
				if (cancelled) return;
				const checkpoint = loadProductionCheckpoint(roundId);
				if (checkpoint) {
					await resumeProductionBook(book, checkpoint, 'instant', controller.signal);
				} else {
					await playPreparedProductionBook(book, 'instant', controller.signal);
				}
			} catch {
				if (!cancelled) productionState.recoveryPending = true;
			}
		})();
		return () => {
			cancelled = true;
			controller.abort();
		};
	});
</script>

<ProductionRound />
