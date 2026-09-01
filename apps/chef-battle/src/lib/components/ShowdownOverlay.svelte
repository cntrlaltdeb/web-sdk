<script lang="ts">
	import { stateGame } from '../../game/stateGame.svelte';

	const chefNames = {
		italian: 'Italian',
		french: 'French',
		chinese: 'Chinese',
	} as const;
</script>

{#if stateGame.totalFreeSpins > 0}
	<section class="showdown-overlay" aria-label="Kitchen Showdown">
		<header>
			<p class="eyebrow">Kitchen Showdown</p>
			<p class="spins">Spins: {stateGame.freeSpin} / {stateGame.totalFreeSpins}</p>
			<p class="remaining">Free spins remaining: {stateGame.remainingFreeSpins}</p>
		</header>

		<section class="showdown-meters" aria-label="Showdown chef meters">
			{#each Object.entries(stateGame.meters) as [chef, meter] (chef)}
				<div class="meter" aria-label={`${chef} showdown meter ${meter}`}>
					<span>{chefNames[chef as keyof typeof chefNames]}: {meter}</span>
					<div class="meter-track" aria-hidden="true">
						<div class="meter-fill" style:width={`${meter}%`}></div>
					</div>
				</div>
			{/each}
		</section>

		<section class="judge-stars" aria-label="Judge Stars">
			<h2>Judge Stars</h2>
			{#each Object.entries(stateGame.judgeStars) as [chef, stars] (chef)}
				<p aria-label={`${chefNames[chef as keyof typeof chefNames]} Judge Stars: ${stars}`}>
					{chefNames[chef as keyof typeof chefNames]} Judge Stars: {stars}
				</p>
			{/each}
		</section>

		{#if stateGame.crownReveal === null}
			<div class="curtain closed" aria-label="Kitchen Crown curtain closed">
				Kitchen Crown curtain closed
			</div>
		{:else}
			<div class="curtain revealed" aria-label="Kitchen Crown curtain revealed">
				<p>{chefNames[stateGame.crownReveal.chef]} wins the Kitchen Crown</p>
				<p>Curtain multiplier: ×{stateGame.crownReveal.multiplier}</p>
				<p>Final bonus win: {stateGame.crownReveal.finalBonusWinAtomicUnits}</p>
			</div>
		{/if}
	</section>
{/if}

<style>
	.showdown-overlay {
		display: grid;
		gap: 0.75rem;
		padding: 1rem;
		border: 3px solid #442d1f;
		border-radius: 1rem;
		background: linear-gradient(135deg, #fff1cf, #f4b968);
		color: #442d1f;
	}
	.eyebrow,
	.spins,
	.remaining,
	.judge-stars h2,
	.judge-stars p,
	.curtain p {
		margin: 0;
	}
	.eyebrow {
		font-weight: 900;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.spins {
		font-size: 1.25rem;
		font-weight: 900;
	}
	.showdown-meters {
		display: grid;
		gap: 0.5rem;
		grid-template-columns: repeat(3, minmax(0, 1fr));
	}
	.meter {
		font-weight: 700;
	}
	.meter-track {
		block-size: 0.5rem;
		margin-block-start: 0.25rem;
		overflow: hidden;
		border-radius: 999px;
		background: #f8deaf;
	}
	.meter-fill {
		block-size: 100%;
		border-radius: inherit;
		background: linear-gradient(90deg, #dc5135, #f8d457);
	}
	.judge-stars {
		display: grid;
		gap: 0.25rem;
	}
	.curtain {
		padding: 0.75rem;
		border-radius: 0.5rem;
		font-weight: 800;
		text-align: center;
	}
	.closed {
		background: #6d2634;
		color: #fff1cf;
	}
	.revealed {
		background: #fef8e8;
	}
</style>
