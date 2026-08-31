import { beforeEach, describe, expect, it } from 'vitest';

import P301 from '../books/production/P3-01.json';
import { validateProductionBook } from './bookValidator';
import { playProductionBook, playValidatedProductionBook } from './localBookAdapter';
import { productionState, resetProductionState } from './stateGame.svelte';

type MutableBook = Array<Record<string, unknown>>;

const cloneBook = (): MutableBook => structuredClone(P301) as MutableBook;

function canonicalize(events: MutableBook): MutableBook {
	events.forEach((event, index) => {
		const sequence = index + 1;
		event.sequence = sequence;
		event.id = `P3-01-e${String(sequence).padStart(4, '0')}`;
		event.roundId = 'P3-01';
	});
	return events;
}

describe('production Base cascade handlers', () => {
	beforeEach(resetProductionState);

	it('uses the supplied ledger balance and settled board without payout arithmetic', async () => {
		const book = validateProductionBook(P301);
		await playValidatedProductionBook(book);

		expect(productionState.roundWinAtomicUnits).toBe(7_000_000);
		expect(productionState.finalWinAtomicUnits).toBe(7_000_000);
		expect(productionState.board).toEqual(
			book.events.find((event) => event.type === 'boardSettled')?.board,
		);
	});

	it.each([
		['missing roundWinUpdate', (book: MutableBook) => book.splice(3, 1), 'roundWinUpdate'],
		[
			'reused sourceEventId',
			(book: MutableBook) => {
				const secondCredit = book[7];
				const firstCredit = book[3];
				if (!secondCredit || !firstCredit) throw new Error('P3-01 ledger events are required');
				secondCredit.sourceEventId = firstCredit.sourceEventId;
			},
			'sourceEventId',
		],
		[
			'wrong balanceAfterAtomicUnits',
			(book: MutableBook) => {
				const secondCredit = book[7];
				if (!secondCredit) throw new Error('P3-01 second ledger event is required');
				secondCredit.balanceAfterAtomicUnits = 6_000_000;
			},
			'balanceAfterAtomicUnits',
		],
	])('rejects %s before any frontend state mutation', async (_name, mutate, error) => {
		productionState.roundId = 'keep-me';
		const invalidBook = cloneBook();
		mutate(invalidBook);

		await expect(playProductionBook(canonicalize(invalidBook))).rejects.toThrow(error);
		expect(productionState.roundId).toBe('keep-me');
		expect(productionState.handledSequences).toEqual([]);
	});
});
