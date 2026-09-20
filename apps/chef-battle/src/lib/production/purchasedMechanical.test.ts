import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';

import index from './__fixtures__/purchased-mechanical/index.json';
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

const literalBooks = import.meta.glob('./__fixtures__/purchased-mechanical/books/*.json', {
	query: '?raw',
	import: 'default',
	eager: true,
});
const NAMES = [
	'kitchenShowdown-minimum',
	'kitchenShowdown-partial',
	'kitchenShowdown-break-even',
	'kitchenShowdown-cap',
	'grandShowdown-minimum',
	'grandShowdown-partial',
	'grandShowdown-break-even',
	'grandShowdown-cap',
	'mysteryTasting-minimum',
	'mysteryTasting-partial',
	'mysteryTasting-break-even',
	'mysteryTasting-cap',
] as const;
const CAP_NAMES = ['kitchenShowdown-cap', 'grandShowdown-cap', 'mysteryTasting-cap'] as const;
const SPEEDS = ['normal', 'fast', 'instant'] as const;

/** Load a fresh local copy of an approved NON_RELEASE purchased-mode fixture. */
function literalBook(name: (typeof NAMES)[number]): unknown {
	const raw = literalBooks[`./__fixtures__/purchased-mechanical/books/${name}.json`];
	if (typeof raw !== 'string') throw new Error(`Missing literal fixture: ${name}`);
	return JSON.parse(raw);
}

describe('Purchased Showdown mechanical Math/Web parity (NON_RELEASE)', () => {
	beforeEach(resetProductionState);
	afterEach(cleanup);

	it('binds twelve accepted Books and753 Python checkpoints without production weights', () => {
		expect(index.classification).toBe('NON_RELEASE_MECHANICAL_FIXTURES');
		expect(index.productionWeights).toBe(false);
		expect(Object.keys(index.books).sort()).toEqual([...NAMES].sort());
		expect(Object.keys(literalBooks)).toHaveLength(12);
		expect(
			Object.values(index.books).reduce((sum, book) => sum + book.checkpointStateHashes.length, 0),
		).toBe(753);
	});

	it.each(NAMES)(
		'%s matches the exact Math Book and every resumable state',
		async (name) => {
			const expected = index.books[name];
			const prepared = await prepareProductionBook(literalBook(name));
			expect(prepared.bookHash).toBe(expected.bookHash);
			expect(prepared.events).toHaveLength(expected.eventCount);
			expect(prepared.finalWinAtomicUnits).toBe(expected.finalWinAtomicUnits);
			expect(await hashProductionReplayState(prepared.finalState)).toBe(expected.finalStateHash);
			expect(prepared.finalState.mode).toBe(expected.mode);
			expect(prepared.finalState.entryKind).toBe('purchase');
			expect(prepared.finalState.paidBetAtomicUnits).toBe(expected.paidBetAtomicUnits);
			expect(prepared.finalState.headliner).toBe(expected.headliner);
			expect(prepared.finalState.winner).toBe('french');
			expect(prepared.finalState.stars.french).toBe(3);
			expect(prepared.finalState.remainingFreeSpins).toBe(0);
			expect(prepared.finalState.completedCourses).toHaveLength(expected.completedCourses);
			expect(prepared.finalState.serviceQueue).toEqual([]);
			expect(prepared.events[0].type).toBe('roundStart');
			expect(prepared.events[1].type).toBe('kitchenShowdownStart');
			expect(prepared.events.some((event) => event.type === 'kitchenShowdownTriggered')).toBe(
				false,
			);
			expect(prepared.events.filter((event) => event.type === 'freeSpinStart')).toHaveLength(
				expected.freeSpins,
			);
			expect(prepared.events.filter((event) => event.type === 'crownCourseComplete')).toHaveLength(
				expected.completedCourses - expected.startingCourses,
			);

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

	it.each(NAMES)('%s plays every event and exact payout at three speeds', async (name) => {
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

	it.each(CAP_NAMES)(
		'%s renders the full Crown cap and retains post-winner Courses',
		async (name) => {
			render(ProductionRound);
			const prepared = await prepareProductionBook(literalBook(name));
			await playPreparedProductionBook(prepared, 'instant');
			expect(screen.getByText('Final win: 20000000000')).not.toBeNull();
			expect(productionState.maxWinReachedAtomicUnits).toBe(20_000_000_000);
			expect(prepared.finalState.maxWinReached).toBe(true);
			expect(prepared.finalState.bonusBankAtomicUnits).toBe(100_000_000);
			expect(prepared.finalState.crownPotAtomicUnits).toBe(199_000_000);
			expect(prepared.finalState.crownMultiplier).toBe(100);
			expect(prepared.finalState.paidBetAtomicUnits).toBe(
				name === 'kitchenShowdown-cap' ? 100_000_000 : 250_000_000,
			);
			const lockIndex = prepared.events.findIndex((event) => event.type === 'kitchenWinnerLocked');
			expect(lockIndex).toBeGreaterThan(0);
			expect(
				prepared.events.slice(lockIndex + 1).some((event) => event.type === 'crownCourseComplete'),
			).toBe(true);
			const capIndex = prepared.events.findIndex((event) => event.type === 'maxWinReached');
			expect(capIndex).toBeGreaterThan(lockIndex);
			expect(prepared.events.slice(capIndex + 1).map((event) => event.type)).toEqual([
				'setTotalWin',
				'finalWin',
			]);
		},
	);
});
