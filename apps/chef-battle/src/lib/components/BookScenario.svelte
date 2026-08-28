<script lang="ts">
	import { playLocalBook } from '../localBookAdapter';
	import type { VerticalSliceId } from '../typesBookEvent';
	import ChefBattleRound from './ChefBattleRound.svelte';

	let { roundId }: { roundId: VerticalSliceId } = $props();

	$effect(() => {
		void playLocalBook(roundId);
	});
</script>

<ChefBattleRound />
