<script lang="ts">
	import { playBookEvent } from '../bookEventHandlerMap';
	import { loadLocalBook } from '../localBookAdapter';
	import type { BookEvent, VerticalSliceId } from '../typesBookEvent';
	import ChefBattleRound from './ChefBattleRound.svelte';

	let {
		roundId,
		snapshotEventType,
	}: {
		roundId: VerticalSliceId;
		snapshotEventType?: BookEvent['type'];
	} = $props();

	$effect(() => {
		let cancelled = false;

		void (async () => {
			const events = await loadLocalBook(roundId);
			for (const event of events) {
				if (cancelled) return;
				await playBookEvent(event);
				if (event.type === snapshotEventType) return;
			}
		})();

		return () => {
			cancelled = true;
		};
	});
</script>

<ChefBattleRound />
