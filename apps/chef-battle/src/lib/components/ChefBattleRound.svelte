<script lang="ts">
	import { stateGame } from '../../game/stateGame.svelte';
	import Board from './Board.svelte';
	import ChefMeters from './ChefMeters.svelte';
</script>

<section class="round" aria-label="Chef Battle round">
	<ChefMeters meters={stateGame.meters} />
	<Board
		clusterPositionKeys={stateGame.clusterPositionKeys}
		removedPositionKeys={stateGame.removedPositionKeys}
		pastaPullPositionKeys={stateGame.pastaPullPositionKeys}
		sauceSpots={stateGame.sauceSpots}
		wokTossPositionKeys={stateGame.wokTossPositionKeys}
	/>
	<p class="final-win">Final win: {stateGame.finalWinAtomicUnits}</p>
</section>

<style>
	.round {
		display: grid;
		gap: 1rem;
	}
	.final-win {
		margin: 0;
		color: #442d1f;
		font-weight: 800;
	}
</style>
