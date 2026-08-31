import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import P305 from '../books/production/P3-05.json';
import P306 from '../books/production/P3-06.json';
import { validateProductionBook } from './bookValidator';
import ProductionRound from './components/ProductionRound.svelte';
import {
	loadProductionBook,
	playProductionBook,
	playValidatedPrefixForTest,
	playValidatedProductionBook,
} from './localBookAdapter';
import { productionState, resetProductionState } from './stateGame.svelte';

type MutableBook = Array<Record<string, unknown>>;

const event = (events: MutableBook, type: string, occurrence = 0): Record<string, unknown> => {
	const match = events.filter((candidate) => candidate.type === type)[occurrence];
	if (!match) throw new Error(`${type} occurrence ${occurrence} is required`);
	return match;
};

function canonicalize(events: MutableBook, roundId: string): MutableBook {
	const idMap = new Map(
		events.flatMap((bookEvent, index) =>
			typeof bookEvent.id === 'string'
				? [[bookEvent.id, `${roundId}-e${String(index + 1).padStart(4, '0')}`] as const]
				: [],
		),
	);
	events.forEach((bookEvent, index) => {
		const sequence = index + 1;
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
		bookEvent.sequence = sequence;
		bookEvent.id = `${roundId}-e${String(sequence).padStart(4, '0')}`;
		bookEvent.roundId = roundId;
	});
	return events;
}

function addFourthScatter(events: MutableBook, includeInTrigger: boolean): void {
	const board = event(events, 'revealBoard').board;
	if (!Array.isArray(board) || !Array.isArray(board[2]))
		throw new Error('P3-05 reveal board is required');
	board[2][4] = 'kitchen_crown_scatter';
	if (!includeInTrigger) return;
	const positions = event(events, 'kitchenShowdownTriggered').scatterPositions;
	if (!Array.isArray(positions)) throw new Error('P3-05 Scatter positions are required');
	positions.splice(2, 0, { reel: 2, row: 4 });
}

function insertOrphanMeta(
	events: MutableBook,
	metaType: 'judgeStarUpdate' | 'kitchenWinnerLocked',
	closedOccurrence: number,
): void {
	const orphan = structuredClone(event(events, metaType));
	const closed = event(events, 'serviceQueueClosed', closedOccurrence);
	events.splice(events.indexOf(closed) + 1, 0, orphan);
}

describe('production Kitchen Showdown', () => {
	beforeEach(resetProductionState);
	afterEach(cleanup);

	it('shows protected Bank, Pot and final-services state after winner lock', async () => {
		render(ProductionRound);
		const book = await loadProductionBook('P3-06');
		const lock = book.events.findIndex((bookEvent) => bookEvent.type === 'kitchenWinnerLocked');
		if (lock < 0) throw new Error('P3-06 must lock a winner');

		await playValidatedPrefixForTest(book, lock + 1);

		expect(screen.getByText('CROWN CLAIMED — FINAL SERVICES')).not.toBeNull();
		expect(screen.getByText('Bonus Bank: 0')).not.toBeNull();
		expect(screen.getByText('Crown Pot: 6000000')).not.toBeNull();
		expect(screen.getByText('Italian ★★★')).not.toBeNull();
	});

	it('renders exact Math-supplied Crown components without applying the multiplier', async () => {
		render(ProductionRound);
		const book = await loadProductionBook('P3-06');
		await playValidatedProductionBook(book);

		expect(screen.getByText('Spins: 10 / 10 — 0 remaining')).not.toBeNull();
		expect(screen.getByText('Bonus Bank: 750000')).not.toBeNull();
		expect(screen.getByText('Crown Pot: 15000000')).not.toBeNull();
		expect(screen.getByText('Italian Course: 1000000')).not.toBeNull();
		expect(screen.getByText('Chinese Course: 5000000')).not.toBeNull();
		expect(screen.getByText('Kitchen Crown: ×3 = 45000000')).not.toBeNull();
		expect(screen.getByText('Showdown final: 45750000')).not.toBeNull();
		expect(productionState.finalWinAtomicUnits).toBe(45_750_000);
	});

	it('replaces the complete natural-entry snapshot and expires Base effects', async () => {
		const book = await loadProductionBook('P3-05');
		const start = book.events.findIndex((bookEvent) => bookEvent.type === 'kitchenShowdownStart');
		if (start < 0) throw new Error('P3-05 must start Kitchen Showdown');

		await playValidatedPrefixForTest(book, start + 1);

		expect(productionState.showdown?.entryKind).toBe('natural');
		expect(productionState.showdown?.meters).toEqual({ italian: 50, french: 50, chinese: 50 });
		expect(productionState.showdown?.bonusBankAtomicUnits).toBe(2_500_000);
		expect(productionState.activeSauceSpots).toEqual([]);
		expect(productionState.pastaPullPositionKeys).toEqual([]);
	});

	it('accepts a canonical payload containing all four initial-reveal Scatters', () => {
		const book = structuredClone(P305) as MutableBook;
		addFourthScatter(book, true);

		expect(validateProductionBook(book).finalWinAtomicUnits).toBe(14_500_000);
	});

	it('rejects a three-Scatter subset on a four-Scatter reveal before state mutation', async () => {
		productionState.roundId = 'keep-me';
		const book = structuredClone(P305) as MutableBook;
		addFourthScatter(book, false);

		await expect(playProductionBook(book)).rejects.toThrow('scatter snapshot');
		expect(productionState.roundId).toBe('keep-me');
		expect(productionState.handledSequences).toEqual([]);
	});

	it.each([
		[
			'zero Course value',
			(book: MutableBook) => {
				event(book, 'crownCourseComplete').courseValueAtomicUnits = 0;
			},
			'positive',
		],
		[
			'forged free-spin Bank snapshot',
			(book: MutableBook) => {
				event(book, 'freeSpinEnd', 4).bonusBankAtomicUnits = 0;
			},
			'snapshot',
		],
		[
			'forged final Crown payout',
			(book: MutableBook) => {
				event(book, 'kitchenCrownReveal').finalWinAtomicUnits = 45_000_000;
			},
			'final payout',
		],
		[
			'forged Service Queue identity',
			(book: MutableBook) => {
				const original = 'P3-06-service-01-italian';
				const forged = 'P3-06-service-99-italian';
				book.forEach((bookEvent) => {
					if (bookEvent.serviceQueueEntryId === original) bookEvent.serviceQueueEntryId = forged;
					if (bookEvent.queueEntryId === original) bookEvent.queueEntryId = forged;
					if (Array.isArray(bookEvent.entries))
						bookEvent.entries.forEach((entry) => {
							if (
								typeof entry === 'object' &&
								entry !== null &&
								'id' in entry &&
								entry.id === original
							)
								entry.id = forged;
						});
				});
			},
			'queue identity',
		],
		[
			'orphan pre-lock Judge Star',
			(book: MutableBook) => insertOrphanMeta(book, 'judgeStarUpdate', 0),
			'canonical Course chain',
		],
		[
			'orphan post-lock Judge Star',
			(book: MutableBook) => insertOrphanMeta(book, 'judgeStarUpdate', 3),
			'canonical Course chain',
		],
		[
			'orphan winner lock',
			(book: MutableBook) => insertOrphanMeta(book, 'kitchenWinnerLocked', 0),
			'canonical Course chain',
		],
	])('rejects %s before frontend state mutation', async (name, mutate, error) => {
		void name;
		productionState.roundId = 'keep-me';
		const book = structuredClone(P306) as MutableBook;
		mutate(book);

		await expect(playProductionBook(canonicalize(book, 'P3-06'))).rejects.toThrow(error);
		expect(productionState.roundId).toBe('keep-me');
		expect(productionState.handledSequences).toEqual([]);
	});

	it('accepts the two exported Books with all ten free-spin boundaries', () => {
		expect(
			(P305 as MutableBook).filter((bookEvent) => bookEvent.type === 'freeSpinEnd'),
		).toHaveLength(10);
		expect(
			(P306 as MutableBook).filter((bookEvent) => bookEvent.type === 'freeSpinEnd'),
		).toHaveLength(10);
	});
});
