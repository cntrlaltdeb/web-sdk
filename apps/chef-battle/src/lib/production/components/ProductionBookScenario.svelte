<script lang="ts">
	import {
		loadPreparedProductionBook,
		loadProductionBook,
		loadProductionCheckpoint,
		playValidatedProductionBook,
	} from '../localBookAdapter';
	import { resumeProductionBook } from '../playback';
	import { productionState } from '../stateGame.svelte';
	import type { ProductionScenarioId } from '../typesBookEvent';
	import ProductionRound from './ProductionRound.svelte';

	let { roundId }: { roundId: ProductionScenarioId } = $props();

	$effect(() => {
		let cancelled = false;
		void (async () => {
			try {
				const checkpoint = loadProductionCheckpoint(roundId);
				if (checkpoint) {
					const book = await loadPreparedProductionBook(roundId);
					if (cancelled) return;
					await resumeProductionBook(book, checkpoint, 'instant');
				} else {
					const book = await loadProductionBook(roundId);
					if (cancelled) return;
					await playValidatedProductionBook(book);
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
