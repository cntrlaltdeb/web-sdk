import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import P303 from '../books/production/P3-03.json';
import P304 from '../books/production/P3-04.json';
import {
	loadProductionBook,
	playProductionBook,
	playValidatedPrefixForTest,
	playValidatedProductionBook,
} from './localBookAdapter';
import { playProductionBookEvent } from './bookEventHandlerMap';
import ProductionRound from './components/ProductionRound.svelte';
import { productionState, resetProductionState } from './stateGame.svelte';

type MutableBook = Array<Record<string, unknown>>;

const event = (events: MutableBook, type: string, occurrence = 0): Record<string, unknown> => {
	const matches = events.filter((candidate) => candidate.type === type);
	const match = matches[occurrence];
	if (!match) throw new Error(`${type} occurrence ${occurrence} is required`);
	return match;
};

describe('production Chef Specials', () => {
	beforeEach(resetProductionState);
	afterEach(cleanup);

	it('renders Sauce as boosts and trusts the supplied Flight payout', async () => {
		render(ProductionRound);
		const book = await loadProductionBook('P3-03');
		const flight = book.events.findIndex(
			(candidate) => candidate.type === 'clusterWin' && candidate.sauceFlightMultiplier === 8,
		);
		if (flight < 0) throw new Error('P3-03 must contain Sauce Flight ×8');

		await playValidatedPrefixForTest(book, flight + 1);

		expect(screen.getByText('BOOST +3×')).not.toBeNull();
		expect(screen.getByText('BOOST +4×')).not.toBeNull();
		expect(screen.getByText('SAUCE FLIGHT ×8')).not.toBeNull();
		expect(productionState.lastClusterWinAtomicUnits).toBe(16_000_000);
	});

	it('keeps the Math-supplied three-chef queue order', async () => {
		render(ProductionRound);
		const book = await loadProductionBook('P3-04');
		const opened = book.events.findIndex((candidate) => candidate.type === 'serviceQueueOpened');
		if (opened < 0) throw new Error('P3-04 must open Service Queue');

		await playValidatedPrefixForTest(book, opened + 1);

		expect(screen.getByLabelText('Service Queue').textContent).toContain(
			'French READYItalian READYChinese READY',
		);
	});

	it('resets every served P3-04 meter immediately when Service Queue closes', async () => {
		const book = await loadProductionBook('P3-04');
		const closed = book.events.findIndex((candidate) => candidate.type === 'serviceQueueClosed');
		if (closed < 0) throw new Error('P3-04 must close Service Queue');
		const closedEvent = book.events[closed];
		if (!closedEvent) throw new Error('P3-04 Service Queue close event is required');

		await playValidatedPrefixForTest(book, closed);
		expect(productionState.meters).toEqual({ italian: 100, french: 100, chinese: 100 });

		await playProductionBookEvent(closedEvent);
		expect(productionState.meters).toEqual({ italian: 0, french: 0, chinese: 0 });
	});

	it('keeps a meter unchanged when its chef is not in the closing queue', async () => {
		const book = await loadProductionBook('P3-04');
		const opened = book.events.findIndex((candidate) => candidate.type === 'serviceQueueOpened');
		const closed = book.events.find((candidate) => candidate.type === 'serviceQueueClosed');
		if (opened < 0 || !closed) throw new Error('P3-04 Service Queue lifecycle is required');

		await playValidatedPrefixForTest(book, opened + 1);
		productionState.serviceQueue = productionState.serviceQueue.filter(
			(entry) => entry.chef !== 'italian',
		);
		productionState.meters = { italian: 37, french: 100, chinese: 100 };

		await playProductionBookEvent(closed);
		expect(productionState.meters).toEqual({ italian: 37, french: 0, chinese: 0 });
	});

	it('expires Base Pasta and Sauce overlays only when finalWin closes the round', async () => {
		const book = await loadProductionBook('P3-03');
		const beforeFinal = book.events.length - 1;

		await playValidatedPrefixForTest(book, beforeFinal);
		expect(productionState.activeSauceSpots).toHaveLength(3);

		await playValidatedProductionBook(book);
		expect(productionState.activeSauceSpots).toEqual([]);
		expect(productionState.pastaPullPositionKeys).toEqual([]);
		expect(productionState.wokTossPositionKeys).toEqual([]);
	});

	it.each([
		[
			'unsorted activeSpots',
			() => {
				const book = structuredClone(P303) as MutableBook;
				const activeSpots = event(book, 'sauceFinish', 1).activeSpots;
				if (!Array.isArray(activeSpots)) throw new Error('P3-03 activeSpots are required');
				activeSpots.reverse();
				return book;
			},
			'activeSpots',
		],
		[
			'Pasta/Wok overlap',
			() => {
				const book = structuredClone(P304) as MutableBook;
				const pastaPositions = event(book, 'pastaPull').positions;
				const wokPositions = event(book, 'wokToss').positions;
				if (!Array.isArray(pastaPositions) || !Array.isArray(wokPositions))
					throw new Error('P3-04 positions are required');
				wokPositions[0] = structuredClone(pastaPositions[0]);
				return book;
			},
			'overlap',
		],
		[
			'broken boardAfter chain',
			() => {
				const book = structuredClone(P304) as MutableBook;
				const boardAfter = event(book, 'wokToss').boardAfter;
				if (!Array.isArray(boardAfter) || !Array.isArray(boardAfter[4]))
					throw new Error('P3-04 Wok boardAfter is required');
				boardAfter[4][3] = 'peking_duck';
				return book;
			},
			'boardAfter',
		],
		[
			'forged sauceFlightMultiplier',
			() => {
				const book = structuredClone(P303) as MutableBook;
				event(book, 'clusterWin', 2).sauceFlightMultiplier = 9;
				return book;
			},
			'sauceFlightMultiplier',
		],
		[
			'French partial Perfect Serve consumption',
			() => {
				const book = structuredClone(P304) as MutableBook;
				event(book, 'perfectServeAward').consumedOverflowUnits = 19;
				return book;
			},
			'overflow',
		],
		[
			'negative Chinese Perfect Serve payout',
			() => {
				const book = structuredClone(P304) as MutableBook;
				event(book, 'perfectServeAward', 1).payoutAtomicUnits = -1;
				return book;
			},
			'safe non-negative',
		],
	])('rejects %s before any handler mutates state', async (_name, makeBook, error) => {
		productionState.roundId = 'keep-me';

		await expect(playProductionBook(makeBook())).rejects.toThrow(error);
		expect(productionState.roundId).toBe('keep-me');
		expect(productionState.handledSequences).toEqual([]);
	});
});
