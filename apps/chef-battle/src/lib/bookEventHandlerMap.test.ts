import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, describe, expect, it } from 'vitest';

import ChefBattleRound from './components/ChefBattleRound.svelte';
import BookScenario from './components/BookScenario.svelte';
import ShowdownOverlay from './components/ShowdownOverlay.svelte';
import VS01 from './books/VS-01.json';
import VS02 from './books/VS-02.json';
import VS03 from './books/VS-03.json';
import VS04 from './books/VS-04.json';
import VS05 from './books/VS-05.json';
import { playBookEvent, playBookEvents } from './bookEventHandlerMap';
import { loadLocalBook, playLocalBook } from './localBookAdapter';
import { resetGameState, stateGame } from '../game/stateGame.svelte';
import type { BookEvent, VerticalSliceId } from './typesBookEvent';

const board = [
	['pizza', 'pizza', 'tiramisu', 'frog_legs', 'french_onion_soup'],
	['pizza', 'pizza', 'croissant', 'peking_duck', 'kung_pao_chicken'],
	['xiaolongbao', 'pasta_carbonara', 'tiramisu', 'frog_legs', 'french_onion_soup'],
	['croissant', 'peking_duck', 'kung_pao_chicken', 'xiaolongbao', 'pasta_carbonara'],
	['tiramisu', 'frog_legs', 'french_onion_soup', 'croissant', 'peking_duck'],
] as const;

type FixtureEvent = Record<string, unknown>;

const fixtures: Record<VerticalSliceId, FixtureEvent[]> = {
	'VS-01': VS01 as FixtureEvent[],
	'VS-02': VS02 as FixtureEvent[],
	'VS-03': VS03 as FixtureEvent[],
	'VS-04': VS04 as FixtureEvent[],
	'VS-05': VS05 as FixtureEvent[],
};

const invalidBoardSymbol = [
	['unknown_ingredient', 'pizza', 'tiramisu', 'frog_legs', 'french_onion_soup'],
	['pizza', 'pizza', 'croissant', 'peking_duck', 'kung_pao_chicken'],
	['xiaolongbao', 'pasta_carbonara', 'tiramisu', 'frog_legs', 'french_onion_soup'],
	['croissant', 'peking_duck', 'kung_pao_chicken', 'xiaolongbao', 'pasta_carbonara'],
	['tiramisu', 'frog_legs', 'french_onion_soup', 'croissant', 'peking_duck'],
];

afterEach(() => {
	cleanup();
	resetGameState();
});

describe('local Chef Battle books', () => {
	it('plays VS-05 in Showdown order and renders only its supplied crown outcome', async () => {
		const showdownTypes = VS05.map((event) => event.type);
		expect(showdownTypes).toEqual([
			'roundStart',
			'revealBoard',
			'kitchenShowdownStart',
			...Array(10).fill('freeSpinStart'),
			...Array(3).fill('judgeStarUpdate'),
			'kitchenCrownReveal',
			'setTotalWin',
			'finalWin',
		]);

		render(ShowdownOverlay);
		await playBookEvents(VS05.slice(0, 13) as BookEvent[]);
		await tick();

		expect(screen.getByText('Spins: 10 / 10')).not.toBeNull();
		expect(screen.getByText('Italian: 50')).not.toBeNull();
		expect(screen.getByText('French: 50')).not.toBeNull();
		expect(screen.getByText('Chinese: 50')).not.toBeNull();
		expect(screen.getByText('Kitchen Crown curtain closed')).not.toBeNull();

		await playBookEvents(VS05.slice(13, 16) as BookEvent[]);
		await tick();
		expect(screen.getByText('Italian Judge Stars: 3')).not.toBeNull();

		await playBookEvent({
			type: 'kitchenCrownReveal',
			id: 'payload-only-crown',
			roundId: 'VS-05',
			chef: 'italian',
			multiplier: 2,
			bonusWinAtomicUnits: 200_000_000,
			finalBonusWinAtomicUnits: 1_234_567,
		});
		await tick();

		expect(screen.getByText('Italian wins the Kitchen Crown')).not.toBeNull();
		expect(screen.getByText('Curtain multiplier: ×2')).not.toBeNull();
		expect(screen.getByText('Final bonus win: 1234567')).not.toBeNull();
	});

	it.each([
		['VS-01', 0],
		['VS-02', 12_000_000],
		['VS-03', 18_000_000],
		['VS-04', 24_000_000],
	] as const)(
		'plays %s in its fixture order and keeps its final win exact',
		async (roundId, finalWin) => {
			const book = await loadLocalBook(roundId);

			await playLocalBook(roundId);

			expect(stateGame.handledEventIds).toEqual(book.map((event) => event.id));
			expect(stateGame.finalWinAtomicUnits).toBe(finalWin);
			expect(stateGame.totalWinAtomicUnits).toBe(finalWin);
		},
	);

	it('hydrates initial meters before applying the VS-04 meter delta', async () => {
		const book = await loadLocalBook('VS-04');

		await playBookEvent(book[0]);
		expect(stateGame.meters).toEqual({ italian: 0, french: 0, chinese: 50 });

		await playBookEvents(book.slice(1, 4));
		expect(stateGame.lastMeterAmount).toBe(50);
		expect(stateGame.meters.chinese).toBe(100);
	});

	it('renders the payload final win, board, and Italian meter without recomputing them', async () => {
		render(ChefBattleRound);

		await playBookEvents([
			{
				type: 'roundStart',
				id: 'e01',
				roundId: 'render',
				betAtomicUnits: 1_000_000,
				meters: { italian: 0, french: 0, chinese: 0 },
			},
			{ type: 'revealBoard', id: 'e02', roundId: 'render', board },
			{
				type: 'chefMeterUpdate',
				id: 'e03',
				roundId: 'render',
				chef: 'italian',
				amount: 40,
				total: 73,
			},
			{ type: 'finalWin', id: 'e04', roundId: 'render', payoutAtomicUnits: 12_345_678 },
		] satisfies BookEvent[]);
		await tick();

		expect(stateGame.board[0]?.symbol).toBe('pizza');
		expect(screen.getByText('Final win: 12345678')).not.toBeNull();
		expect(screen.getByText('Italian: 73')).not.toBeNull();
		expect(screen.getByLabelText('Cell 1: pizza')).not.toBeNull();
	});

	it('renders reel-major payload coordinates in row-major grid positions', async () => {
		render(ChefBattleRound);
		await playBookEvent({ type: 'revealBoard', id: 'e01', roundId: 'coordinates', board });
		await tick();

		expect(screen.getByLabelText('Cell 3: xiaolongbao')).not.toBeNull();
		expect(screen.getByLabelText('Cell 6: pizza')).not.toBeNull();
	});

	it('clears stale cluster highlights when a new board is revealed', async () => {
		await playBookEvents([
			{
				type: 'clusterWin',
				id: 'e01',
				roundId: 'clear-cluster',
				chef: 'italian',
				symbol: 'pizza',
				positions: [{ reel: 0, row: 0 }],
				payoutAtomicUnits: 123,
			},
			{ type: 'revealBoard', id: 'e02', roundId: 'clear-cluster', board },
		]);

		expect(stateGame.clusterPositionKeys).toEqual([]);
		expect(stateGame.clusterWinAtomicUnits).toBe(0);
	});

	it('renders Pasta Pull highlights and resets only the meter supplied by its payload', async () => {
		render(ChefBattleRound);
		await playBookEvents([
			{ type: 'revealBoard', id: 'e01', roundId: 'pasta', board },
			{
				type: 'chefMeterUpdate',
				id: 'e02',
				roundId: 'pasta',
				chef: 'italian',
				amount: 40,
				total: 100,
			},
			{
				type: 'pastaPull',
				id: 'e03',
				roundId: 'pasta',
				chef: 'italian',
				positions: [
					{ reel: 2, row: 0 },
					{ reel: 2, row: 1 },
				],
				meterAfter: 0,
			},
		] satisfies BookEvent[]);
		await tick();

		expect(screen.getByText('Italian: 0')).not.toBeNull();
		expect(screen.getAllByLabelText(/Pasta Pull active/)).toHaveLength(2);
	});

	it('keeps board symbols from the preceding reveal when Pasta Pull arrives', async () => {
		await playBookEvents([
			{ type: 'revealBoard', id: 'e01', roundId: 'pasta-board', board },
			{
				type: 'pastaPull',
				id: 'e02',
				roundId: 'pasta-board',
				chef: 'italian',
				positions: [{ reel: 2, row: 1 }],
				meterAfter: 0,
			},
		] satisfies BookEvent[]);

		expect(
			stateGame.board.find((cell) => cell.position.reel === 2 && cell.position.row === 1),
		).toMatchObject({
			symbol: 'pasta_carbonara',
			isWild: false,
		});
	});

	it('pauses a Pasta Pull scenario on its special event instead of autoplaying to final win', async () => {
		render(BookScenario, { roundId: 'VS-02', snapshotEventType: 'pastaPull' });

		await waitFor(() => expect(screen.getAllByLabelText(/Pasta Pull active/)).toHaveLength(2));
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(screen.getByText('Final win: 0')).not.toBeNull();
	});

	it.each([
		['VS-03', 'sauceFinish', '×10'],
		['VS-04', 'wokToss', /Wok Toss active/],
	] as const)(
		'renders the named %s story snapshot at %s',
		async (roundId, snapshotEventType, expectedState) => {
			render(BookScenario, { roundId, snapshotEventType });

			await waitFor(() => {
				if (typeof expectedState === 'string')
					expect(screen.getByText(expectedState)).not.toBeNull();
				else expect(screen.getAllByLabelText(expectedState)).toHaveLength(4);
			});
			expect(screen.getByText('Final win: 0')).not.toBeNull();
		},
	);

	it('clears Pasta Pull highlights when the next reveal supplies the transformed board', async () => {
		render(ChefBattleRound);
		await playBookEvents([
			{ type: 'revealBoard', id: 'e01', roundId: 'pasta-lifecycle', board },
			{
				type: 'pastaPull',
				id: 'e02',
				roundId: 'pasta-lifecycle',
				chef: 'italian',
				positions: [{ reel: 2, row: 0 }],
				meterAfter: 0,
			},
			{ type: 'revealBoard', id: 'e03', roundId: 'pasta-lifecycle', board },
		] satisfies BookEvent[]);
		await tick();

		expect(screen.queryByLabelText(/Pasta Pull active/)).toBeNull();
	});

	it('clears Wok Toss highlights when the next reveal supplies the transformed board', async () => {
		render(ChefBattleRound);
		await playBookEvents([
			{ type: 'revealBoard', id: 'e01', roundId: 'wok-lifecycle', board },
			{
				type: 'wokToss',
				id: 'e02',
				roundId: 'wok-lifecycle',
				chef: 'chinese',
				meterAfter: 0,
				positions: [{ reel: 1, row: 1 }],
				targetSymbol: 'kung_pao_chicken',
			},
			{ type: 'revealBoard', id: 'e03', roundId: 'wok-lifecycle', board },
		] satisfies BookEvent[]);
		await tick();

		expect(screen.queryByLabelText(/Wok Toss active/)).toBeNull();
	});

	it('renders Sauce Finish multiplier badges from payload spots', async () => {
		render(ChefBattleRound);
		await playBookEvents([
			{ type: 'revealBoard', id: 'e01', roundId: 'sauce', board },
			{
				type: 'sauceFinish',
				id: 'e02',
				roundId: 'sauce',
				chef: 'french',
				meterAfter: 0,
				spots: [
					{ position: { reel: 0, row: 0 }, multiplier: 2 },
					{ position: { reel: 3, row: 3 }, multiplier: 10 },
				],
			},
		] satisfies BookEvent[]);
		await tick();

		expect(screen.getByText('French: 0')).not.toBeNull();
		expect(screen.getByText('×2')).not.toBeNull();
		expect(screen.getByText('×10')).not.toBeNull();
	});

	it('keeps Sauce Finish payload multipliers visible after the next cascade reveal', async () => {
		render(ChefBattleRound);
		await playBookEvents([
			{ type: 'revealBoard', id: 'e01', roundId: 'sauce-cascade', board },
			{
				type: 'sauceFinish',
				id: 'e02',
				roundId: 'sauce-cascade',
				chef: 'french',
				meterAfter: 0,
				spots: [{ position: { reel: 3, row: 3 }, multiplier: 10 }],
			},
			{ type: 'revealBoard', id: 'e03', roundId: 'sauce-cascade', board },
		] satisfies BookEvent[]);
		await tick();

		expect(screen.getByText('×10')).not.toBeNull();
	});

	it('renders Wok Toss highlights from its payload positions', async () => {
		render(ChefBattleRound);
		await playBookEvents([
			{ type: 'revealBoard', id: 'e01', roundId: 'wok', board },
			{
				type: 'wokToss',
				id: 'e02',
				roundId: 'wok',
				chef: 'chinese',
				meterAfter: 0,
				positions: [
					{ reel: 0, row: 0 },
					{ reel: 1, row: 0 },
					{ reel: 1, row: 1 },
					{ reel: 2, row: 0 },
				],
				targetSymbol: 'kung_pao_chicken',
			},
		] satisfies BookEvent[]);
		await tick();

		expect(screen.getAllByLabelText(/Wok Toss active/)).toHaveLength(4);
		expect(screen.getByText('Chinese: 0')).not.toBeNull();
	});

	it('keeps board symbols from the preceding reveal when Wok Toss arrives', async () => {
		await playBookEvents([
			{ type: 'revealBoard', id: 'e01', roundId: 'wok-board', board },
			{
				type: 'wokToss',
				id: 'e02',
				roundId: 'wok-board',
				chef: 'chinese',
				meterAfter: 0,
				positions: [{ reel: 0, row: 0 }],
				targetSymbol: 'kung_pao_chicken',
			},
		] satisfies BookEvent[]);

		expect(
			stateGame.board.find((cell) => cell.position.reel === 0 && cell.position.row === 0),
		).toMatchObject({
			symbol: 'pizza',
			isWild: false,
		});
	});

	it('rejects an unknown event type instead of ignoring it', async () => {
		await expect(
			playBookEvent({
				type: 'unrecognisedEvent',
				id: 'e01',
				roundId: 'unknown',
			} as unknown as BookEvent),
		).rejects.toThrow('Unknown BookEvent type: unrecognisedEvent');
	});

	it('rejects a local special event that is missing meterAfter', async () => {
		const pastaPull = VS02.find((event) => event.type === 'pastaPull') as { meterAfter?: unknown };
		const meterAfter = pastaPull.meterAfter;
		delete pastaPull.meterAfter;

		try {
			await expect(loadLocalBook('VS-02')).rejects.toThrow('meterAfter');
		} finally {
			pastaPull.meterAfter = meterAfter;
		}
	});

	it.each([
		['VS-02', 'clusterWin', 'positions', [{ reel: 5, row: 0 }], 'positions'],
		['VS-02', 'clusterWin', 'positions', [], 'positions'],
		[
			'VS-02',
			'removeSymbols',
			'positions',
			[
				{ reel: 0, row: 0 },
				{ reel: 0, row: 0 },
			],
			'positions',
		],
		['VS-02', 'clusterWin', 'chef', 'pastry', 'chef'],
		['VS-02', 'revealBoard', 'board', invalidBoardSymbol, 'board'],
		['VS-02', 'roundStart', 'betAtomicUnits', -1, 'betAtomicUnits'],
		['VS-02', 'roundStart', 'betAtomicUnits', 1.5, 'betAtomicUnits'],
		['VS-02', 'roundStart', 'betAtomicUnits', Number.MAX_SAFE_INTEGER + 1, 'betAtomicUnits'],
		['VS-04', 'roundStart', 'meters', { italian: 0, french: 0, chinese: 101 }, 'meters'],
		['VS-04', 'roundStart', 'meters', { italian: 0, french: 0, chinese: 50, pastry: 1 }, 'meters'],
		['VS-02', 'chefMeterUpdate', 'amount', 40.5, 'amount'],
		['VS-02', 'chefMeterUpdate', 'total', 101, 'total'],
		['VS-03', 'sauceFinish', 'spots', [{ position: { reel: 0, row: 0 }, multiplier: 11 }], 'spots'],
		[
			'VS-03',
			'sauceFinish',
			'spots',
			[{ position: { reel: 0, row: 0 }, multiplier: 2.5 }],
			'spots',
		],
		['VS-04', 'wokToss', 'targetSymbol', 'raw_ingredient', 'targetSymbol'],
		[
			'VS-05',
			'kitchenShowdownStart',
			'meters',
			{ italian: 50, french: 50, chinese: 101 },
			'meters',
		],
		['VS-05', 'freeSpinStart', 'spin', 1.5, 'spin'],
		['VS-05', 'freeSpinStart', 'remainingFreeSpins', -1, 'remainingFreeSpins'],
		['VS-05', 'judgeStarUpdate', 'stars', 4, 'stars'],
		['VS-05', 'kitchenCrownReveal', 'multiplier', 101, 'multiplier'],
		['VS-05', 'kitchenCrownReveal', 'bonusWinAtomicUnits', -1, 'bonusWinAtomicUnits'],
	] as const)(
		'rejects malformed %s %s payloads with invalid %s',
		async (roundId, eventType, field, invalidValue, expectedField) => {
			const event = fixtures[roundId].find((candidate) => candidate.type === eventType);
			expect(event).toBeDefined();
			if (!event) return;

			const originalValue = event[field];
			event[field] = invalidValue;

			try {
				await expect(loadLocalBook(roundId)).rejects.toThrow(expectedField);
			} finally {
				event[field] = originalValue;
			}
		},
	);

	it.each([
		['VS-01', 'roundStart', 'betAtomicUnits'],
		['VS-01', 'roundStart', 'meters'],
		['VS-01', 'revealBoard', 'board'],
		['VS-02', 'clusterWin', 'chef'],
		['VS-02', 'removeSymbols', 'positions'],
		['VS-02', 'cascade', 'index'],
		['VS-02', 'chefMeterUpdate', 'amount'],
		['VS-02', 'pastaPull', 'positions'],
		['VS-03', 'sauceFinish', 'spots'],
		['VS-04', 'wokToss', 'targetSymbol'],
		['VS-05', 'kitchenShowdownStart', 'meters'],
		['VS-05', 'freeSpinStart', 'remainingFreeSpins'],
		['VS-05', 'judgeStarUpdate', 'stars'],
		['VS-05', 'kitchenCrownReveal', 'multiplier'],
		['VS-05', 'setTotalWin', 'totalWinAtomicUnits'],
		['VS-05', 'finalWin', 'payoutAtomicUnits'],
	] as const)('requires %s on known %s events', async (roundId, eventType, field) => {
		const event = fixtures[roundId].find((candidate) => candidate.type === eventType);
		expect(event).toBeDefined();
		if (!event) return;

		const originalValue = event[field];
		delete event[field];

		try {
			await expect(loadLocalBook(roundId)).rejects.toThrow(field);
		} finally {
			event[field] = originalValue;
		}
	});

	it.each([
		['VS-02', 'pastaPull', 'positions', [], 'positions'],
		[
			'VS-02',
			'pastaPull',
			'positions',
			[
				{ reel: 2, row: 0 },
				{ reel: 2, row: 0 },
			],
			'positions',
		],
		[
			'VS-02',
			'pastaPull',
			'positions',
			[
				{ reel: 0, row: 0 },
				{ reel: 2, row: 0 },
			],
			'positions',
		],
		[
			'VS-02',
			'pastaPull',
			'positions',
			[
				{ reel: 0, row: 0 },
				{ reel: 0, row: 1 },
				{ reel: 0, row: 2 },
			],
			'positions',
		],
		[
			'VS-03',
			'sauceFinish',
			'spots',
			[{ position: { reel: 0, row: 0 }, multiplier: 2 }] * 2,
			'spots',
		],
		[
			'VS-03',
			'sauceFinish',
			'spots',
			[
				{ position: { reel: 0, row: 0 }, multiplier: 2 },
				{ position: { reel: 1, row: 0 }, multiplier: 3 },
				{ position: { reel: 2, row: 0 }, multiplier: 4 },
				{ position: { reel: 3, row: 0 }, multiplier: 5 },
				{ position: { reel: 4, row: 0 }, multiplier: 6 },
				{ position: { reel: 4, row: 1 }, multiplier: 7 },
			],
			'spots',
		],
		[
			'VS-03',
			'sauceFinish',
			'spots',
			[
				{ position: { reel: 0, row: 0 }, multiplier: 2 },
				{ position: { reel: 0, row: 0 }, multiplier: 3 },
				{ position: { reel: 1, row: 0 }, multiplier: 4 },
			],
			'spots',
		],
		['VS-04', 'wokToss', 'positions', [], 'positions'],
		[
			'VS-04',
			'wokToss',
			'positions',
			[
				{ reel: 0, row: 0 },
				{ reel: 0, row: 1 },
				{ reel: 1, row: 0 },
			],
			'positions',
		],
		[
			'VS-04',
			'wokToss',
			'positions',
			[
				{ reel: 0, row: 0 },
				{ reel: 0, row: 1 },
				{ reel: 0, row: 2 },
				{ reel: 0, row: 3 },
				{ reel: 0, row: 4 },
				{ reel: 1, row: 0 },
				{ reel: 1, row: 1 },
				{ reel: 1, row: 2 },
				{ reel: 1, row: 3 },
			],
			'positions',
		],
		[
			'VS-04',
			'wokToss',
			'positions',
			[
				{ reel: 0, row: 0 },
				{ reel: 0, row: 0 },
				{ reel: 1, row: 0 },
				{ reel: 1, row: 1 },
			],
			'positions',
		],
		['VS-04', 'wokToss', 'targetSymbol', 'pizza', 'targetSymbol'],
	] as const)(
		'rejects local %s %s payloads whose special positions violate Math semantics',
		async (roundId, eventType, field, invalidValue, expectedField) => {
			const event = fixtures[roundId].find((candidate) => candidate.type === eventType);
			expect(event).toBeDefined();
			if (!event) return;

			const originalValue = event[field];
			event[field] = invalidValue;

			try {
				await expect(loadLocalBook(roundId)).rejects.toThrow(expectedField);
			} finally {
				event[field] = originalValue;
			}
		},
	);
});
