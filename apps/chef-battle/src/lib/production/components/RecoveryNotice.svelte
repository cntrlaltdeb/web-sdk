<script lang="ts">
	import { productionState } from '../stateGame.svelte';
</script>

{#if productionState.maxWinReachedAtomicUnits !== null}
	<p class="terminal" role="status">MAX WIN REACHED — BONUS COMPLETE</p>
{/if}

<style>
	.terminal {
		margin: 0;
		padding: 0.65rem 0.85rem;
		border: 2px solid #9d6b24;
		border-radius: 0.65rem;
		background: #fff4d8;
		color: #442d1f;
		font-weight: 900;
		text-align: center;
	}
</style>
