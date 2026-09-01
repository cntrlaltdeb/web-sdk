<script lang="ts">
	import type { MeterValues } from '../typesBookEvent';

	let { meters }: { meters: MeterValues } = $props();
</script>

<section class="chef-meters" aria-label="Chef meters">
	{#each Object.entries(meters) as [chef, total] (chef)}
		<div class="meter" aria-label={`${chef} meter ${total}`}>
			<span>{chef[0]?.toUpperCase()}{chef.slice(1)}: {total}</span>
			<div aria-hidden="true" class="meter-track">
				<div class="meter-fill" style:width={`${total}%`}></div>
			</div>
		</div>
	{/each}
</section>

<style>
	.chef-meters {
		display: grid;
		gap: 0.5rem;
		grid-template-columns: repeat(3, minmax(0, 1fr));
	}
	.meter {
		color: #442d1f;
		font-weight: 700;
	}
	.meter-track {
		block-size: 0.5rem;
		margin-block-start: 0.25rem;
		overflow: hidden;
		border-radius: 999px;
		background: #f2d5a9;
	}
	.meter-fill {
		block-size: 100%;
		border-radius: inherit;
		background: linear-gradient(90deg, #ef6c35, #f7c948);
	}
</style>
