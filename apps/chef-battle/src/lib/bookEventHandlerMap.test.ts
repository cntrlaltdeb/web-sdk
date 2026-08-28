import { cleanup, render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, describe, expect, it } from 'vitest';

import ChefBattleRound from './components/ChefBattleRound.svelte';
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

	it('transforms Wok Toss positions only to its payload target symbol', async () => {
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

		expect(screen.getAllByLabelText(/kung_pao_chicken.*Wok Toss active/)).toHaveLength(4);
		expect(screen.getByText('Chinese: 0')).not.toBeNull();
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
});
