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
