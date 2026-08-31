import { beforeEach, describe, expect, it } from 'vitest';

import P300 from '../books/production/P3-00.json';
import { playProductionBook } from './localBookAdapter';
import { productionState, resetProductionState } from './stateGame.svelte';

describe('production Book validation', () => {
	beforeEach(resetProductionState);

	it('rejects a sequence gap before the first handler mutates state', async () => {
		productionState.roundId = 'keep-me';
		const invalidBook = structuredClone(P300) as Array<Record<string, unknown>>;
		const secondEvent = invalidBook[1];
		if (!secondEvent) throw new Error('P3-00 must contain revealBoard');
		secondEvent.sequence = 3;
		secondEvent.id = 'P3-00-e0003';

		await expect(playProductionBook(invalidBook)).rejects.toThrow('sequence');
		expect(productionState.roundId).toBe('keep-me');
		expect(productionState.handledSequences).toEqual([]);
	});
});
