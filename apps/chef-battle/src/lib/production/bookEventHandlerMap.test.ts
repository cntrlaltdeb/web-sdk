import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import P301 from '../books/production/P3-01.json';
import P302 from '../books/production/P3-02.json';
import { findCanonicalProductionClusters, validateProductionBook } from './bookValidator';
import {
	loadProductionBook,
	playProductionBook,
	playValidatedPrefixForTest,
	playValidatedProductionBook,
} from './localBookAdapter';
import ProductionRound from './components/ProductionRound.svelte';
import { productionState, resetProductionState } from './stateGame.svelte';

type MutableBook = Array<Record<string, unknown>>;

const equalSizeDifferentSymbolsBoard = [
	['pizza', 'pizza', 'tiramisu', 'frog_legs', 'french_onion_soup'],
	['pizza', 'pizza', 'kung_pao_chicken', 'xiaolongbao', 'peking_duck'],
	['tiramisu', 'frog_legs', 'french_onion_soup', 'kung_pao_chicken', 'xiaolongbao'],
	['croissant', 'croissant', 'tiramisu', 'frog_legs', 'french_onion_soup'],
	['croissant', 'croissant', 'kung_pao_chicken', 'xiaolongbao', 'peking_duck'],
] as const;

const equalSizeAndSymbolBoard = [
	['pizza', 'pizza', 'tiramisu', 'frog_legs', 'french_onion_soup'],
	['pizza', 'pizza', 'kung_pao_chicken', 'xiaolongbao', 'peking_duck'],
	['tiramisu', 'frog_legs', 'french_onion_soup', 'croissant', 'peking_duck'],
	['frog_legs', 'french_onion_soup', 'croissant', 'pizza', 'pizza'],
	['croissant', 'peking_duck', 'kung_pao_chicken', 'pizza', 'pizza'],
] as const;

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
	afterEach(cleanup);

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

	it.each([
		[
			'cluster that does not match the current canonical board',
			(book: MutableBook) => {
				const cluster = book[2];
				if (!cluster) throw new Error('P3-01 first cluster is required');
				cluster.symbol = 'tiramisu';
			},
			'canonical',
		],
		[
			'winning boardSettled terminal state',
			(book: MutableBook) => {
				const settled = book[11];
				const reveal = book[1];
				if (!settled || !reveal) throw new Error('P3-01 board snapshots are required');
				settled.board = reveal.board;
			},
			'remaining',
		],
	])(
		'rejects semantic Base board drift before any frontend state mutation',
		async (_name, mutate, error) => {
			productionState.roundId = 'keep-me';
			const invalidBook = cloneBook();
			mutate(invalidBook);

			await expect(playProductionBook(canonicalize(invalidBook))).rejects.toThrow(error);
			expect(productionState.roundId).toBe('keep-me');
		},
	);

	it('uses symbol then first position for equal-size canonical cluster ties', () => {
		expect(
			findCanonicalProductionClusters(equalSizeDifferentSymbolsBoard).map((cluster) => [
				cluster.symbol,
				cluster.positions[0],
			]),
		).toEqual([
			['croissant', { reel: 3, row: 0 }],
			['pizza', { reel: 0, row: 0 }],
		]);
		expect(
			findCanonicalProductionClusters(equalSizeAndSymbolBoard).map(
				(cluster) => cluster.positions[0],
			),
		).toEqual([
			{ reel: 0, row: 0 },
			{ reel: 3, row: 3 },
		]);
	});

	it('accepts a zero-payout cluster cascade as a complete Base lifecycle', () => {
		const zeroPayoutBook = cloneBook();
		for (const index of [2, 6]) {
			const cluster = zeroPayoutBook[index];
			if (!cluster) throw new Error('P3-01 cluster is required');
			cluster.basePayoutAtomicUnits = 0;
			cluster.payoutAtomicUnits = 0;
		}
		for (const index of [3, 7]) {
			const credit = zeroPayoutBook[index];
			if (!credit) throw new Error('P3-01 credit is required');
			credit.creditAtomicUnits = 0;
			credit.balanceAfterAtomicUnits = 0;
		}
		const total = zeroPayoutBook[12];
		const final = zeroPayoutBook[13];
		if (!total || !final) throw new Error('P3-01 terminal events are required');
		total.totalWinAtomicUnits = 0;
		final.payoutAtomicUnits = 0;

		expect(validateProductionBook(zeroPayoutBook).finalWinAtomicUnits).toBe(0);
	});

	it('shows READY, queue order and exact Perfect Serve award from P3-02', async () => {
		render(ProductionRound);
		const book = await loadProductionBook('P3-02');
		const opened = book.events.findIndex((event) => event.type === 'serviceQueueOpened');
		if (opened < 0) throw new Error('P3-02 must open Service Queue');
		await playValidatedPrefixForTest(book, opened + 1);

		expect(screen.getByLabelText('Service Queue')).not.toBeNull();
		expect(screen.getByText('Italian READY')).not.toBeNull();

		await playValidatedProductionBook(book);
		expect(screen.getByText('Perfect Serve: 1500000')).not.toBeNull();
		expect(productionState.roundWinAtomicUnits).toBe(productionState.finalWinAtomicUnits);
	});

	it.each([
		[
			'Perfect Serve before Pasta Pull',
			(book: MutableBook) => {
				const pasta = book.findIndex((event) => event.type === 'pastaPull');
				const award = book.findIndex((event) => event.type === 'perfectServeAward');
				if (pasta < 0 || award < 0) throw new Error('P3-02 special events are required');
				const [perfectServeAward] = book.splice(award, 1);
				if (!perfectServeAward) throw new Error('P3-02 Perfect Serve is required');
				book.splice(pasta, 0, perfectServeAward);
			},
			'pastaPull',
		],
		[
			'wrong Service Queue entry id',
			(book: MutableBook) => {
				const pasta = book.find((event) => event.type === 'pastaPull');
				if (!pasta) throw new Error('P3-02 Pasta Pull is required');
				pasta.queueEntryId = 'P3-02-service-01-french';
			},
			'queueEntryId',
		],
	])('rejects %s before frontend state mutation', async (_name, mutate, error) => {
		productionState.roundId = 'keep-me';
		const invalidBook = structuredClone(P302) as MutableBook;
		mutate(invalidBook);
		canonicalizeP302(invalidBook);

		await expect(playProductionBook(invalidBook)).rejects.toThrow(error);
		expect(productionState.roundId).toBe('keep-me');
		expect(productionState.handledSequences).toEqual([]);
	});

	it('accepts the next canonical cluster group only after the P3-02 Service Queue closes', () => {
		const book = validateProductionBook(P302);

		expect(book.events.filter((event) => event.type === 'cascade')).toHaveLength(2);
		expect(book.finalWinAtomicUnits).toBe(8_500_000);
	});

	it('rejects a forged 80 plus 40 meter update that only conserves charge units', () => {
		const invalidBook = structuredClone(P302) as MutableBook;
		const meter = invalidBook.filter((event) => event.type === 'chefMeterUpdate')[1];
		if (!meter) throw new Error('P3-02 second meter update is required');
		Object.assign(meter, {
			appliedCharge: 10,
			overflowCharge: 30,
			meterAfter: 90,
			serviceQueueEntryId: null,
			perfectServeUnitsAfter: 0,
		});
		const opened = invalidBook.findIndex((event) => event.type === 'serviceQueueOpened');
		const closed = invalidBook.findIndex((event) => event.type === 'serviceQueueClosed');
		if (opened < 0 || closed < 0) throw new Error('P3-02 Service Queue is required');
		invalidBook.splice(opened, closed - opened + 1);
		const total = invalidBook.find((event) => event.type === 'setTotalWin');
		const final = invalidBook.find((event) => event.type === 'finalWin');
		if (!total || !final) throw new Error('P3-02 terminal events are required');
		total.totalWinAtomicUnits = 7_000_000;
		final.payoutAtomicUnits = 7_000_000;

		expect(() => validateProductionBook(canonicalizeP302(invalidBook))).toThrow('charge fields');
	});

	it('rejects an additional field in the Book-authored Service Queue entry', () => {
		const invalidBook = structuredClone(P302) as MutableBook;
		const opened = invalidBook.find((event) => event.type === 'serviceQueueOpened');
		if (!opened || !Array.isArray(opened.entries))
			throw new Error('P3-02 Service Queue is required');
		const entry = opened.entries[0] as Record<string, unknown> | undefined;
		if (!entry) throw new Error('P3-02 Service Queue entry is required');
		entry.forged = true;

		expect(() => validateProductionBook(canonicalizeP302(invalidBook))).toThrow('queue order');
	});
});

function canonicalizeP302(events: MutableBook): MutableBook {
	events.forEach((event, index) => {
		const sequence = index + 1;
		event.sequence = sequence;
		event.id = `P3-02-e${String(sequence).padStart(4, '0')}`;
		event.roundId = 'P3-02';
	});
	return events;
}
