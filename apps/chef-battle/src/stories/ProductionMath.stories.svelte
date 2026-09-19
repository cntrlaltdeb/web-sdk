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
<Story name="P3-12 Retrigger Replay" args={{ roundId: 'P3-12' }} {template} />

<Story name="S4-00 Zero Return" args={{ roundId: 'S4-00' }} {template} />
<Story name="S4-01 Partial Return" args={{ roundId: 'S4-01' }} {template} />
<Story name="S4-02 Exact Break Even" args={{ roundId: 'S4-02' }} {template} />
<Story name="S4-03 Small Base Profit" args={{ roundId: 'S4-03' }} {template} />
<Story name="S4-04 Medium Base Win" args={{ roundId: 'S4-04' }} {template} />
<Story name="S4-05 Pasta Pull" args={{ roundId: 'S4-05' }} {template} />
<Story name="S4-06 Sauce Finish Flight" args={{ roundId: 'S4-06' }} {template} />
<Story name="S4-07 Wok Toss" args={{ roundId: 'S4-07' }} {template} />
<Story name="S4-08 Perfect Serve" args={{ roundId: 'S4-08' }} {template} />
<Story name="S4-09 Multiple Services" args={{ roundId: 'S4-09' }} {template} />
<Story name="S4-10 Weak Regular Showdown" args={{ roundId: 'S4-10' }} {template} />
<Story name="S4-11 Median Regular Showdown" args={{ roundId: 'S4-11' }} {template} />
<Story name="S4-12 Retrigger Resume" args={{ roundId: 'S4-12' }} {template} />
<Story name="S4-13 100x Tail" args={{ roundId: 'S4-13' }} {template} />
<Story name="S4-14 500x Tail" args={{ roundId: 'S4-14' }} {template} />
<Story name="S4-15 1000x Tail" args={{ roundId: 'S4-15' }} {template} />
<Story name="S4-16 5000x Tail" args={{ roundId: 'S4-16' }} {template} />
<Story name="S4-17 Exact Maximum" args={{ roundId: 'S4-17' }} {template} />
