import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import P306 from '../books/production/P3-06.json';
import P307 from '../books/production/P3-07.json';
import { validateProductionBook } from './bookValidator';
import ProductionRound from './components/ProductionRound.svelte';
import {
	loadProductionBook,
	playProductionBook,
	playValidatedProductionBook,
} from './localBookAdapter';
import { productionState, resetProductionState } from './stateGame.svelte';

type MutableBook = Array<Record<string, unknown>>;

function event(book: MutableBook, type: string, occurrence = 0): Record<string, unknown> {
	const found = book.filter((candidate) => candidate.type === type)[occurrence];
	if (!found) throw new Error(`${type} occurrence ${occurrence} is required`);
	return found;
}

function canonicalize(book: MutableBook, roundId: string): MutableBook {
	const idMap = new Map(
		book.flatMap((bookEvent, index) =>
			typeof bookEvent.id === 'string'
				? [[bookEvent.id, `${roundId}-e${String(index + 1).padStart(4, '0')}`] as const]
				: [],
		),
	);
	book.forEach((bookEvent, index) => {
		if (typeof bookEvent.sourceEventId === 'string' && idMap.has(bookEvent.sourceEventId))
			bookEvent.sourceEventId = idMap.get(bookEvent.sourceEventId);
		if (Array.isArray(bookEvent.completedCourses))
			bookEvent.completedCourses.forEach((course) => {
				if (
					typeof course === 'object' &&
					course !== null &&
					'sourceEventId' in course &&
					typeof course.sourceEventId === 'string' &&
					idMap.has(course.sourceEventId)
				)
					course.sourceEventId = idMap.get(course.sourceEventId);
			});
		bookEvent.sequence = index + 1;
		bookEvent.id = `${roundId}-e${String(index + 1).padStart(4, '0')}`;
		bookEvent.roundId = roundId;
	});
	return book;
}

describe('production max win terminal', () => {
	beforeEach(resetProductionState);
	afterEach(cleanup);

	it('renders exact max win as a terminal bonus state', async () => {
		render(ProductionRound);
		const book = await loadProductionBook('P3-07');
		await playValidatedProductionBook(book);

		expect(screen.getByText('MAX WIN REACHED — BONUS COMPLETE')).not.toBeNull();
		expect(productionState.maxWinReachedAtomicUnits).toBe(20_000_000_000);
		expect(productionState.finalWinAtomicUnits).toBe(20_000_000_000);
	});

	it('requires maxWinReached immediately after an exact-cap Crown reveal', () => {
		const book = structuredClone(P307) as MutableBook;
		book.splice(
			book.findIndex((bookEvent) => bookEvent.type === 'maxWinReached'),
			1,
		);

		expect(() => validateProductionBook(canonicalize(book, 'P3-07'))).toThrow('maxWinReached');
	});

	it('rejects maxWinReached below the exact cap', () => {
		const book = structuredClone(P306) as MutableBook;
		const totalIndex = book.findIndex((bookEvent) => bookEvent.type === 'setTotalWin');
		book.splice(totalIndex, 0, {
			type: 'maxWinReached',
			maxWinAtomicUnits: 20_000_000_000,
		});

		expect(() => validateProductionBook(canonicalize(book, 'P3-06'))).toThrow('exact cap');
	});

	it.each([
		['cascade', { type: 'cascade', index: 99 }],
		['free spin', { type: 'freeSpinStart', currentFreeSpin: 11, remainingFreeSpins: 0, board: [] }],
		[
			'retrigger',
			{
				type: 'freeSpinRetrigger',
				scatterPositions: [{ reel: 0, row: 0 }],
				awardedFreeSpins: 3,
				remainingFreeSpinsAfter: 3,
			},
		],
		[
			'money event',
			{
				type: 'bonusBankUpdate',
				sourceEventId: 'forged-source',
				creditAtomicUnits: 1,
				balanceAfterAtomicUnits: 1,
			},
		],
	])('rejects %s after max before the first handler', async (_name, postMaxEvent) => {
		productionState.roundId = 'keep-me';
		const book = structuredClone(P307) as MutableBook;
		const maxIndex = book.findIndex((bookEvent) => bookEvent.type === 'maxWinReached');
		book.splice(maxIndex + 1, 0, postMaxEvent);

		await expect(playProductionBook(canonicalize(book, 'P3-07'))).rejects.toThrow(
			'after maxWinReached',
		);
		expect(productionState.roundId).toBe('keep-me');
		expect(productionState.handledSequences).toEqual([]);
	});

	it('checks selected Crown headroom immediately after a Crown Pot update', () => {
		const book = structuredClone(P306) as MutableBook;
		event(book, 'crownCourseComplete').courseValueAtomicUnits = 20_000_000_000;

		expect(() => validateProductionBook(book)).toThrow('Crown outcome exceeds');
	});

	it('checks selected Crown headroom immediately after a Bonus Bank update', () => {
		const book = structuredClone(P306) as MutableBook;
		const award = event(book, 'perfectServeAward');
		const credit = event(book, 'bonusBankUpdate');
		award.payoutAtomicUnits = 20_000_000_000;
		credit.creditAtomicUnits = 20_000_000_000;
		credit.balanceAfterAtomicUnits = 20_000_000_000;

		expect(() => validateProductionBook(book)).toThrow('Crown outcome exceeds');
	});

	it.each([-1, true, 9_007_199_254_740_992])('rejects unsafe maxWinReached amount %o', (amount) => {
		const book = structuredClone(P307) as MutableBook;
		event(book, 'maxWinReached').maxWinAtomicUnits = amount;

		expect(() => validateProductionBook(book)).toThrow('safe non-negative integer');
	});
});
