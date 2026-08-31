import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import P309 from '../books/production/P3-09.json';
import P310 from '../books/production/P3-10.json';
import P311 from '../books/production/P3-11.json';
import ProductionRound from './components/ProductionRound.svelte';
import {
	loadProductionBook,
	playProductionBook,
	playValidatedPrefixForTest,
	playValidatedProductionBook,
} from './localBookAdapter';
import { productionState, resetProductionState } from './stateGame.svelte';

type MutableBook = Array<Record<string, unknown>>;

const event = (events: MutableBook, type: string): Record<string, unknown> => {
	const match = events.find((candidate) => candidate.type === type);
	if (!match) throw new Error(`${type} is required`);
	return match;
};

describe('production paid modes', () => {
	beforeEach(resetProductionState);
	afterEach(cleanup);

	it.each([
		['P3-08', 'Extra Reservation', 2_000_000],
		['P3-09', 'Signature Spin', 50_000_000],
		['P3-10', 'Grand Showdown', 250_000_000],
		['P3-11', 'Mystery Tasting', 250_000_000],
	] as const)('renders %s from roundStart payload', async (scenarioId, label, paidBet) => {
		render(ProductionRound);
		await playValidatedProductionBook(await loadProductionBook(scenarioId));

		expect(screen.getByText(label)).not.toBeNull();
		expect(screen.getByText(`Paid cost: ${paidBet}`)).not.toBeNull();
		expect(productionState.paidBetAtomicUnits).toBe(paidBet);
		expect(productionState.maxWinAtomicUnits).toBe(20_000_000_000);
	});

	it('renders the Math-selected Signature chef and opens Service before cluster playback', async () => {
		render(ProductionRound);
		const book = await loadProductionBook('P3-09');
		const opened = book.events.findIndex((bookEvent) => bookEvent.type === 'serviceQueueOpened');
		const closed = book.events.findIndex((bookEvent) => bookEvent.type === 'serviceQueueClosed');
		const cluster = book.events.findIndex((bookEvent) => bookEvent.type === 'clusterWin');
		if (opened < 0 || closed < 0 || cluster < 0) throw new Error('P3-09 opening flow is required');

		await playValidatedPrefixForTest(book, opened + 1);

		expect(productionState.selectedChef).toBe('french');
		expect(screen.getByText('Selected Chef: French')).not.toBeNull();
		expect(book.events[opened]).toMatchObject({ phase: 'opening', source: 'initialReady' });
		expect(closed).toBeLessThan(cluster);
		expect(book.events.some((bookEvent) => bookEvent.type === 'crownCourseComplete')).toBe(false);
	});

	it('renders the Math-selected Mystery Headliner and preserves opening-to-real star order', async () => {
		render(ProductionRound);
		const book = await loadProductionBook('P3-11');
		const startIndex = book.events.findIndex(
			(bookEvent) => bookEvent.type === 'kitchenShowdownStart',
		);
		if (startIndex < 0) throw new Error('P3-11 start snapshot is required');
		const start = book.events[startIndex];
		if (!start || start.type !== 'kitchenShowdownStart') throw new Error('P3-11 start is invalid');
		const stars = book.events
			.filter(
				(bookEvent) => bookEvent.type === 'judgeStarUpdate' && bookEvent.chef === start.headliner,
			)
			.map((bookEvent) => (bookEvent.type === 'judgeStarUpdate' ? bookEvent.starsAfter : 0));

		await playValidatedPrefixForTest(book, startIndex + 1);

		expect(productionState.headliner).toBe('french');
		expect(screen.getByText('Headliner: French')).not.toBeNull();
		expect(stars.slice(0, 2)).toEqual([2, 3]);
	});

	it('resets Math-authored mode identity between sequential independent Books', async () => {
		await playValidatedProductionBook(await loadProductionBook('P3-09'));
		expect(productionState.selectedChef).toBe('french');
		expect(productionState.headliner).toBeNull();

		await playValidatedProductionBook(await loadProductionBook('P3-11'));
		expect(productionState.selectedChef).toBeNull();
		expect(productionState.headliner).toBe('french');

		await playValidatedProductionBook(await loadProductionBook('P3-08'));
		expect(productionState.selectedChef).toBeNull();
		expect(productionState.headliner).toBeNull();
	});

	it.each([
		[
			'Signature opening phase',
			P309,
			(book: MutableBook) => {
				delete event(book, 'serviceQueueOpened').phase;
			},
			'opening',
		],
		[
			'Signature selected chef',
			P309,
			(book: MutableBook) => {
				event(book, 'roundStart').selectedChef = 'italian';
			},
			'selectedChef',
		],
		[
			'Grand starting stars',
			P310,
			(book: MutableBook) => {
				const stars = event(book, 'kitchenShowdownStart').stars;
				if (typeof stars !== 'object' || stars === null)
					throw new Error('Grand stars are required');
				(stars as Record<string, unknown>).italian = 0;
			},
			'Grand',
		],
		[
			'Mystery Headliner meter',
			P311,
			(book: MutableBook) => {
				const meters = event(book, 'kitchenShowdownStart').meters;
				if (typeof meters !== 'object' || meters === null)
					throw new Error('Mystery meters are required');
				(meters as Record<string, unknown>).french = 50;
			},
			'Mystery',
		],
	] as const)(
		'rejects invalid %s before frontend state mutation',
		async (_name, fixture, mutate, error) => {
			productionState.roundId = 'keep-me';
			const book = structuredClone(fixture) as MutableBook;
			mutate(book);

			await expect(playProductionBook(book)).rejects.toThrow(error);
			expect(productionState.roundId).toBe('keep-me');
			expect(productionState.handledSequences).toEqual([]);
		},
	);
});
