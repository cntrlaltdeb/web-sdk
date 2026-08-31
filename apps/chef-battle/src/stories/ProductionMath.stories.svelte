<script lang="ts" module>
	import { defineMeta } from '@storybook/addon-svelte-csf';

	const { Story } = defineMeta({ title: 'ProductionMath/Chef Battle' });
</script>

<script lang="ts">
	import ProductionBookScenario from '../lib/production/components/ProductionBookScenario.svelte';
	import type { ProductionScenarioId } from '../lib/production/typesBookEvent';
</script>

{#snippet template(args: { roundId: ProductionScenarioId })}
	<ProductionBookScenario roundId={args.roundId} />
{/snippet}

<Story name="P3-00 Zero Win" args={{ roundId: 'P3-00' }} {template} />
<Story name="P3-01 Base Cascade Ledger" args={{ roundId: 'P3-01' }} {template} />
<Story name="P3-02 Perfect Serve" args={{ roundId: 'P3-02' }} {template} />
<Story name="P3-03 Sauce Flight" args={{ roundId: 'P3-03' }} {template} />
<Story name="P3-04 Multi-Chef Service" args={{ roundId: 'P3-04' }} {template} />
<Story name="P3-05 Natural Showdown" args={{ roundId: 'P3-05' }} {template} />
<Story name="P3-06 Purchased Showdown" args={{ roundId: 'P3-06' }} {template} />
<Story name="P3-07 Exact Max Win" args={{ roundId: 'P3-07' }} {template} />
<Story name="P3-08 Extra Reservation" args={{ roundId: 'P3-08' }} {template} />
<Story name="P3-09 Signature Spin" args={{ roundId: 'P3-09' }} {template} />
<Story name="P3-10 Grand Showdown" args={{ roundId: 'P3-10' }} {template} />
<Story name="P3-11 Mystery Tasting" args={{ roundId: 'P3-11' }} {template} />
