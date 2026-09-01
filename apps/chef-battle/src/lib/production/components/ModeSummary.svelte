<script lang="ts">
	import { productionState } from '../stateGame.svelte';
	import type { ChefId, GameMode } from '../typesBookEvent';

	const modeLabels: Readonly<Record<GameMode, string>> = {
		base: 'Base Game',
		extraReservation: 'Extra Reservation',
		signatureSpin: 'Signature Spin',
		kitchenShowdown: 'Kitchen Showdown',
		grandShowdown: 'Grand Showdown',
		mysteryTasting: 'Mystery Tasting',
	};
	const chefLabels: Readonly<Record<ChefId, string>> = {
		italian: 'Italian',
		french: 'French',
		chinese: 'Chinese',
	};
</script>

<aside class="mode" aria-label="Paid mode">
	<strong>{modeLabels[productionState.mode]}</strong>
	<span>Paid cost: {productionState.paidBetAtomicUnits}</span>
	{#if productionState.mode === 'signatureSpin' && productionState.selectedChef}
		<span>Selected Chef: {chefLabels[productionState.selectedChef]}</span>
	{/if}
	{#if productionState.mode === 'mysteryTasting' && productionState.headliner}
		<span>Headliner: {chefLabels[productionState.headliner]}</span>
	{/if}
</aside>

<style>
	.mode {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem 0.75rem;
		align-items: baseline;
		color: #442d1f;
	}
</style>
