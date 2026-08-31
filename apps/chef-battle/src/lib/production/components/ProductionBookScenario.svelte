<script lang="ts">
	import {
		loadPreparedProductionBook,
		loadProductionCheckpoint,
	} from '../localBookAdapter';
	import { playPreparedProductionBook, resumeProductionBook } from '../playback';
	import { productionState } from '../stateGame.svelte';
	import type { ProductionScenarioId } from '../typesBookEvent';
	import ProductionRound from './ProductionRound.svelte';

	let { roundId }: { roundId: ProductionScenarioId } = $props();

	$effect(() => {
		let cancelled = false;
		void (async () => {
			try {
				const book = await loadPreparedProductionBook(roundId);
				if (cancelled) return;
				const checkpoint = loadProductionCheckpoint(roundId);
				if (checkpoint) {
					await resumeProductionBook(book, checkpoint, 'instant');
				} else {
					await playPreparedProductionBook(book, 'instant');
				}
			} catch {
				if (!cancelled) productionState.recoveryPending = true;
			}
		})();
		return () => {
			cancelled = true;
		};
	});
</script>

<ProductionRound />
