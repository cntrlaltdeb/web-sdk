import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';

import index from './__fixtures__/signature-mechanical/index.json';
import {
	canonicalProductionJson,
	hashProductionReplayState,
	prepareProductionBook,
	reduceProductionEvents,
	validateReplayCheckpoint,
} from './checkpoint';
import ProductionRound from './components/ProductionRound.svelte';
import { playPreparedProductionBook, resumeProductionBook } from './playback';
import { productionState, resetProductionState } from './stateGame.svelte';

const literalBooks = import.meta.glob('./__fixtures__/signature-mechanical/books/*.json', {
	query: '?raw',
	import: 'default',
	eager: true,
});
const NAMES = [
	'zero-italian',
	'zero-french',
	'positive-chinese',
	'break-even-french',
	'high-french',
	'cap-french',
	'high-italian',
	'high-chinese',
	'partial-french',
	'lower-high-tail-french',
	'middle-high-tail-french',
] as const;
const SPEEDS = ['normal', 'fast', 'instant'] as const;

/** Load a fresh local copy of an approved NON_RELEASE mechanical fixture. */
function literalBook(name: (typeof NAMES)[number]): unknown {
	const raw = literalBooks[`./__fixtures__/signature-mechanical/books/${name}.json`];
	if (typeof raw !== 'string') throw new Error(`Missing literal fixture: ${name}`);
	return JSON.parse(raw);
}

describe('Signature mechanical Math/Web parity (NON_RELEASE)', () => {
	beforeEach(resetProductionState);
	afterEach(cleanup);

	it('binds exactly eleven accepted mechanical Books and 187 Python checkpoints', () => {
		expect(index.classification).toBe('NON_RELEASE_MECHANICAL_FIXTURES');
		expect(index.productionWeights).toBe(false);
		expect(Object.keys(index.books).sort()).toEqual([...NAMES].sort());
		expect(Object.keys(literalBooks)).toHaveLength(11);
		expect(
			Object.values(index.books).reduce((sum, book) => sum + book.checkpointStateHashes.length, 0),
		).toBe(187);
	});

	it.each(NAMES)(
		'%s matches the Math Book, final state, and every resumable state',
		async (name) => {
			const expected = index.books[name];
			const prepared = await prepareProductionBook(literalBook(name));
			expect(prepared.bookHash).toBe(expected.bookHash);
			expect(prepared.events).toHaveLength(expected.eventCount);
			expect(prepared.finalWinAtomicUnits).toBe(expected.finalWinAtomicUnits);
			expect(await hashProductionReplayState(prepared.finalState)).toBe(expected.finalStateHash);
			expect(prepared.finalState.selectedChef).toBe(expected.selectedChef);
			expect(prepared.finalState.paidBetAtomicUnits).toBe(50_000_000);
			expect(prepared.finalState.showdownTriggered).toBe(false);
			expect(prepared.finalState.completedCourses).toEqual([]);
			expect(prepared.finalState.winner).toBeNull();
			expect(prepared.finalState.headliner).toBeNull();

			for (const [offset, stateHash] of expected.checkpointStateHashes.entries()) {
				const sequence = offset + 1;
				const state = reduceProductionEvents(prepared.events.slice(0, sequence));
				expect(await hashProductionReplayState(state)).toBe(stateHash);
				const saved = {
					roundId: state.roundId,
					sequence,
					bookHash: expected.bookHash,
					stateHash,
					state,
				};
				await validateReplayCheckpoint(prepared, saved);
				await resumeProductionBook(prepared, saved, 'instant');
				expect(productionState.handledSequences).toEqual(
					prepared.events.slice(sequence).map((event) => event.sequence),
				);
				expect(canonicalProductionJson(productionState.replayState)).toBe(
					canonicalProductionJson(prepared.finalState),
				);
			}
		},
		30_000,
	);

	it.each(NAMES)('%s plays every event and exact payout at all three speeds', async (name) => {
		const prepared = await prepareProductionBook(literalBook(name));
		for (const speed of SPEEDS) {
			await playPreparedProductionBook(prepared, speed);
			expect(productionState.handledSequences).toEqual(
				prepared.events.map((event) => event.sequence),
			);
			expect(productionState.finalWinAtomicUnits).toBe(index.books[name].finalWinAtomicUnits);
			expect(canonicalProductionJson(productionState.replayState)).toBe(
				canonicalProductionJson(prepared.finalState),
			);
		}
	});

	it('renders the exact non-Crown cap and preserves its terminal state', async () => {
		render(ProductionRound);
		const prepared = await prepareProductionBook(literalBook('cap-french'));
		await playPreparedProductionBook(prepared, 'instant');
		expect(screen.getByText('Final win: 20000000000')).not.toBeNull();
		expect(prepared.events).toHaveLength(51);
		expect(productionState.maxWinReachedAtomicUnits).toBe(20_000_000_000);
		expect(prepared.finalState.maxWinReached).toBe(true);
		expect(prepared.finalState.meters).toEqual({ italian: 0, french: 90, chinese: 0 });
		expect(prepared.finalState.serviceQueue).toEqual([]);
		expect(prepared.events.filter((event) => event.type === 'serviceQueueOpened')).toHaveLength(4);
		expect(prepared.events.some((event) => event.type === 'kitchenCrownReveal')).toBe(false);
		const capIndex = prepared.events.findIndex((event) => event.type === 'maxWinReached');
		expect(capIndex).toBeGreaterThan(0);
		expect(prepared.events.slice(capIndex + 1).map((event) => event.type)).toEqual([
			'setTotalWin',
			'finalWin',
		]);
	});
});
