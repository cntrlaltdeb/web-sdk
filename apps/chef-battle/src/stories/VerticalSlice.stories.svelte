<script lang="ts" module>
	import { defineMeta } from '@storybook/addon-svelte-csf';

	const { Story } = defineMeta({ title: 'VerticalSlice/Chef Battle' });
</script>

<script lang="ts">
	import BookScenario from '../lib/components/BookScenario.svelte';
	import type { VerticalSliceId } from '../lib/typesBookEvent';

	type StoryArgs = {
		roundId: VerticalSliceId;
		snapshotEventType?: 'pastaPull' | 'sauceFinish' | 'wokToss' | 'kitchenCrownReveal';
	};
</script>

{#snippet template(args: StoryArgs)}
	<BookScenario roundId={args.roundId} snapshotEventType={args.snapshotEventType} />
{/snippet}

<Story name="VS-01 Zero Win" args={{ roundId: 'VS-01' }} {template} />
<Story name="VS-02 Pasta Pull" args={{ roundId: 'VS-02', snapshotEventType: 'pastaPull' }} {template} />
<Story name="VS-03 Sauce Finish" args={{ roundId: 'VS-03', snapshotEventType: 'sauceFinish' }} {template} />
<Story name="VS-04 Wok Toss" args={{ roundId: 'VS-04', snapshotEventType: 'wokToss' }} {template} />
<Story name="VS-05 Kitchen Showdown" args={{ roundId: 'VS-05', snapshotEventType: 'kitchenCrownReveal' }} {template} />
