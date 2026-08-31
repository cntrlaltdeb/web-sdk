<script lang="ts">
	import { loadProductionBook, playValidatedProductionBook } from '../localBookAdapter';
	import type { ProductionScenarioId } from '../typesBookEvent';
	import ProductionRound from './ProductionRound.svelte';

	let { roundId }: { roundId: ProductionScenarioId } = $props();

	$effect(() => {
		let cancelled = false;
		void (async () => {
			const book = await loadProductionBook(roundId);
			if (cancelled) return;
			await playValidatedProductionBook(book);
		})();
		return () => {
			cancelled = true;
		};
	});
</script>

<ProductionRound />
