import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';

import index from './__fixtures__/purchased-support/index.json';
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

const literalBooks = import.meta.glob('./__fixtures__/purchased-support/books/*.json', {
	query: '?raw',
	import: 'default',
	eager: true,
});
const NAMES = [
	'ks-small-c10-french',
	'ks-profit-c3',
	'ks-profit-c4',
	'ks-feature-c5',
	'ks-tail-20-40-c20',
	'ks-tail-40-80-c50',
	'ks-tail-80-200-c100',
] as const;
const SPEEDS = ['normal', 'fast', 'instant'] as const;

/** Read a fresh copy of a reviewed NON_RELEASE Kitchen Showdown support Book. */
function literalBook(name: (typeof NAMES)[number]): unknown {
	const raw = literalBooks['./__fixtures__/purchased-support/books/' + name + '.json'];
	if (typeof raw !== 'string') throw new Error('Missing support fixture: ' + name);
	return JSON.parse(raw);
}

describe('Kitchen Showdown support Math/Web parity (NON_RELEASE)', () => {
	beforeEach(resetProductionState);
	afterEach(cleanup);

	it('binds seven reviewed mechanical Books without production weights', () => {
		expect(index.classification).toBe('NON_RELEASE_MECHANICAL_SUPPORT');
		expect(index.productionWeights).toBe(false);
		expect(Object.keys(index.books).sort()).toEqual([...NAMES].sort());
		expect(Object.keys(literalBooks)).toHaveLength(7);
		expect(index.mathReviewStatus).toBe('GO_MECHANICAL_SUPPORT_NON_RELEASE');
	});

	it.each(NAMES)(
		'%s matches the Math Book and every resumable Python state',
		async (name) => {
			const expected = index.books[name];
			const prepared = await prepareProductionBook(literalBook(name));
			expect(prepared.bookHash).toBe(expected.bookHash);
			expect(prepared.events).toHaveLength(expected.eventCount);
			expect(prepared.finalWinAtomicUnits).toBe(expected.finalWinAtomicUnits);
			expect(await hashProductionReplayState(prepared.finalState)).toBe(expected.finalStateHash);
			expect(prepared.finalState.mode).toBe('kitchenShowdown');
			expect(prepared.finalState.entryKind).toBe('purchase');
			expect(prepared.finalState.paidBetAtomicUnits).toBe(100_000_000);
			expect(prepared.finalState.winner).toBe(expected.winner);
			expect(prepared.finalState.stars).toHaveProperty(expected.winner, 3);
			expect(prepared.finalState.crownMultiplier).toBe(expected.crownMultiplier);
			expect(prepared.finalState.maxWinReached).toBe(false);
			expect(prepared.finalState.remainingFreeSpins).toBe(0);
			expect(prepared.finalState.serviceQueue).toEqual([]);
			expect(prepared.events.some((event) => event.type === 'maxWinReached')).toBe(false);
			expect(prepared.events.some((event) => event.type === 'kitchenShowdownTriggered')).toBe(
				false,
			);
			expect(expected.checkpointStateHashes).toHaveLength(prepared.events.length - 1);

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

	it.each(NAMES)(
		'%s plays its exact payout at three speeds and renders the result',
		async (name) => {
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
			render(ProductionRound);
			expect(
				screen.getByText('Final win: ' + index.books[name].finalWinAtomicUnits),
			).not.toBeNull();
		},
	);

	it.each([
		['ks-profit-c3', 'pastaPull', 'italian'],
		['ks-feature-c5', 'wokToss', 'chinese'],
	] as const)(
		'%s earns its winner through three chef actions and preserves later Courses',
		async (name, action, chef) => {
			const prepared = await prepareProductionBook(literalBook(name));
			const lock = prepared.events.findIndex((event) => event.type === 'kitchenWinnerLocked');
			expect(lock).toBeGreaterThan(0);
			expect(prepared.events.slice(0, lock).filter((event) => event.type === action)).toHaveLength(
				3,
			);
			expect(
				prepared.events.slice(lock + 1).some((event) => event.type === 'crownCourseComplete'),
			).toBe(true);
			expect(prepared.finalState.stars).toHaveProperty(chef, 3);
			const locked = reduceProductionEvents(prepared.events.slice(0, lock + 1));
			expect(prepared.finalState.stars).toEqual(locked.stars);
		},
	);
});
