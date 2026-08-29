import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, describe, expect, it } from 'vitest';

import ChefBattleRound from './components/ChefBattleRound.svelte';
import BookScenario from './components/BookScenario.svelte';
import VS02 from './books/VS-02.json';
import { playBookEvent, playBookEvents } from './bookEventHandlerMap';
import { loadLocalBook, playLocalBook } from './localBookAdapter';
import { resetGameState, stateGame } from '../game/stateGame.svelte';
import type { BookEvent } from './typesBookEvent';

const board = [
	['pizza', 'pizza', 'tiramisu', 'frog_legs', 'french_onion_soup'],
	['pizza', 'pizza', 'croissant', 'peking_duck', 'kung_pao_chicken'],
	['xiaolongbao', 'pasta_carbonara', 'tiramisu', 'frog_legs', 'french_onion_soup'],
	['croissant', 'peking_duck', 'kung_pao_chicken', 'xiaolongbao', 'pasta_carbonara'],
	['tiramisu', 'frog_legs', 'french_onion_soup', 'croissant', 'peking_duck'],
] as const;

afterEach(() => {
	cleanup();
	resetGameState();
});

describe('local Chef Battle books', () => {
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

	it('renders the payload final win, board, and Italian meter without recomputing them', async () => {
		render(ChefBattleRound);

		await playBookEvents([
			{ type: 'roundStart', id: 'e01', roundId: 'render', betAtomicUnits: 1_000_000 },
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

		expect(stateGame.board.find((cell) => cell.position.reel === 2 && cell.position.row === 1)).toMatchObject({
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
	] as const)('renders the named %s story snapshot at %s', async (roundId, snapshotEventType, expectedState) => {
		render(BookScenario, { roundId, snapshotEventType });

		await waitFor(() => {
			if (typeof expectedState === 'string') expect(screen.getByText(expectedState)).not.toBeNull();
			else expect(screen.getAllByLabelText(expectedState)).toHaveLength(4);
		});
		expect(screen.getByText('Final win: 0')).not.toBeNull();
	});

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

		expect(stateGame.board.find((cell) => cell.position.reel === 0 && cell.position.row === 0)).toMatchObject({
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
});
