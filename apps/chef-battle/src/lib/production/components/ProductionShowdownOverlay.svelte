<script lang="ts">
	import { productionState } from '../stateGame.svelte';
	import type { ChefId } from '../typesBookEvent';

	const chefs: readonly ChefId[] = ['italian', 'french', 'chinese'];
	const labels: Readonly<Record<ChefId, string>> = {
		italian: 'Italian',
		french: 'French',
		chinese: 'Chinese',
	};
	const stars = (count: number): string => '★'.repeat(count) + '☆'.repeat(3 - count);
</script>

{#if productionState.showdown}
	{@const showdown = productionState.showdown}
	<aside class="showdown" aria-label="Kitchen Showdown">
		<h2>Kitchen Showdown</h2>
		<p>
			Spins: {showdown.currentFreeSpin} / {showdown.totalFreeSpins} — {showdown.remainingFreeSpins} remaining
		</p>
		<div class="chefs">
			{#each chefs as chef (chef)}
				<div class="chef">
					<strong>{labels[chef]} {stars(showdown.stars[chef])}</strong>
					<span>Meter: {showdown.meters[chef]}</span>
				</div>
			{/each}
		</div>
		<p>Bonus Bank: {showdown.bonusBankAtomicUnits}</p>
		<p>Crown Pot: {showdown.crownPotAtomicUnits}</p>
		<p>Completed Courses: {showdown.completedCourses.length}</p>
		<ul aria-label="Completed Crown Courses">
			{#each showdown.completedCourses as course (course.id)}
				<li>{labels[course.chef]} Course: {course.valueAtomicUnits}</li>
			{/each}
		</ul>
		{#if showdown.winner}
			<p class="winner">CROWN CLAIMED — FINAL SERVICES</p>
		{/if}
		{#if showdown.crownMultiplier && showdown.crownPayoutAtomicUnits !== null}
			<p>Kitchen Crown: ×{showdown.crownMultiplier} = {showdown.crownPayoutAtomicUnits}</p>
		{/if}
		{#if showdown.finalWinAtomicUnits !== null}
			<p class="final">Showdown final: {showdown.finalWinAtomicUnits}</p>
		{/if}
	</aside>
{/if}

<style>
	.showdown {
		display: grid;
		gap: 0.35rem;
		padding: 0.75rem;
		border: 2px solid #9d6b24;
		border-radius: 0.75rem;
		background: #fff4d8;
		color: #442d1f;
	}

	.showdown h2,
	.showdown ul,
	.showdown p {
		margin: 0;
	}

	.showdown ul {
		padding-left: 1.25rem;
	}

	.chefs {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.4rem;
	}

	.chef {
		display: grid;
		gap: 0.15rem;
	}

	.winner,
	.final {
		font-weight: 900;
	}
</style>
