<script lang="ts" module>
	import { defineMeta } from '@storybook/addon-svelte-csf';

	const { Story } = defineMeta({ title: 'ProductionMath/Chef Battle' });
</script>

<script lang="ts">
	import ProductionBookScenario from '../lib/production/components/ProductionBookScenario.svelte';
</script>

{#snippet template()}
	<ProductionBookScenario roundId="P3-00" />
{/snippet}

<Story name="P3-00 Zero Win" {template} />
