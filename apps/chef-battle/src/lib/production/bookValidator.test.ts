import { beforeEach, describe, expect, it } from 'vitest';

import P300 from '../books/production/P3-00.json';
import { validateProductionBook } from './bookValidator';
import {
	playProductionBook,
	playValidatedPrefixForTest,
	playValidatedProductionBook,
} from './localBookAdapter';
import { productionState, resetProductionState } from './stateGame.svelte';
import type { ValidatedProductionBook } from './typesBookEvent';

type MutableBook = Array<Record<string, unknown>>;

const cloneBook = (): MutableBook => structuredClone(P300) as MutableBook;

function applyCanonicalEnvelope(events: MutableBook): void {
	events.forEach((event, index) => {
		const sequence = index + 1;
		event.sequence = sequence;
		event.id = `P3-00-e${String(sequence).padStart(4, '0')}`;
		event.roundId = 'P3-00';
	});
}

function forgedValidatedBook(): ValidatedProductionBook {
	return {
		events: cloneBook() as unknown as ValidatedProductionBook['events'],
		finalWinAtomicUnits: 0,
	};
}

describe('production Book validation', () => {
	beforeEach(resetProductionState);

	it('rejects a sequence gap before the first handler mutates state', async () => {
		productionState.roundId = 'keep-me';
		const invalidBook = cloneBook();
		const secondEvent = invalidBook[1];
		if (!secondEvent) throw new Error('P3-00 must contain revealBoard');
		secondEvent.sequence = 3;
		secondEvent.id = 'P3-00-e0003';

		await expect(playProductionBook(invalidBook)).rejects.toThrow('sequence');
		expect(productionState.roundId).toBe('keep-me');
		expect(productionState.handledSequences).toEqual([]);
	});

	it.each([
		['missing revealBoard', (book: MutableBook) => book.splice(1, 1)],
		['duplicate roundStart', (book: MutableBook) => book.splice(1, 0, { ...book[0] })],
		['early finalWin', (book: MutableBook) => book.splice(2, 0, { ...book.at(-1) })],
	])('rejects a noncanonical P3-00 lifecycle with %s', (_name, mutate) => {
		const invalidBook = cloneBook();
		mutate(invalidBook);
		applyCanonicalEnvelope(invalidBook);

		expect(() => validateProductionBook(invalidBook)).toThrow('exactly');
	});

	it.each([
		undefined,
		{ italian: 0, french: 0 },
		{ italian: 0, french: 0, chinese: 0, other: 0 },
		{ italian: -1, french: 0, chinese: 0 },
		{ italian: true, french: 0, chinese: 0 },
		{ italian: 0.5, french: 0, chinese: 0 },
		{ italian: 0, french: 101, chinese: 0 },
	])('rejects invalid roundStart meters: %o', (meters) => {
		const invalidBook = cloneBook();
		const roundStart = invalidBook[0];
		if (!roundStart) throw new Error('P3-00 must contain roundStart');
		roundStart.meters = meters;

		expect(() => validateProductionBook(invalidBook)).toThrow('meters');
	});

	it('rejects a structurally forged Book before reset or dispatch', async () => {
		productionState.roundId = 'keep-me';

		await expect(playValidatedProductionBook(forgedValidatedBook())).rejects.toThrow();
		expect(productionState.roundId).toBe('keep-me');
		expect(productionState.handledSequences).toEqual([]);
	});

	it('rejects a structurally forged Book before prefix dispatch', async () => {
		productionState.roundId = 'keep-me';

		await expect(playValidatedPrefixForTest(forgedValidatedBook(), 1)).rejects.toThrow();
		expect(productionState.roundId).toBe('keep-me');
		expect(productionState.handledSequences).toEqual([]);
	});
});
