import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';

import index from './__fixtures__/premium-support/index.json';
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
import type { ChefId } from './typesBookEvent';

const literalBooks = import.meta.glob('./__fixtures__/premium-support/books/*.json', {
	query: '?raw',
	import: 'default',
	eager: true,
});
const GRAND_NAMES = [
	'grand-small-c3-italian',
	'grand-profit-c4-chinese',
	'grand-profit-c5-french',
	'grand-feature-c10-french',
	'grand-feature-c20-french',
	'grand-tail-20-40-c50-italian',
	'grand-tail-40-80-c100-chinese',
] as const;
const MYSTERY_NAMES = [
	'mystery-small-c4-italian',
	'mystery-partial-c5-chinese',
	'mystery-profit-c10-different-winner',
	'mystery-feature-c20-italian',
	'mystery-tail-20-40-c50-french',
	'mystery-tail-40-80-c100-chinese',
] as const;
const NAMES = [...GRAND_NAMES, ...MYSTERY_NAMES] as const;
const SPEEDS = ['normal', 'fast', 'instant'] as const;
const SERVICE_ACTION = {
	italian: 'pastaPull',
	french: 'sauceFinish',
	chinese: 'wokToss',
} as const;

/** Read a fresh copy of a reviewed NON_RELEASE Premium Showdown support Book. */
function literalBook(name: (typeof NAMES)[number]): unknown {
	const raw = literalBooks['./__fixtures__/premium-support/books/' + name + '.json'];
	if (typeof raw !== 'string') throw new Error('Missing premium support fixture: ' + name);
	return JSON.parse(raw);
}

describe('Premium Showdown support Math/Web parity (NON_RELEASE)', () => {
	beforeEach(resetProductionState);
	afterEach(cleanup);

	it('binds thirteen reviewed Books and all 1047 Python replay states', () => {
		expect(index.classification).toBe('NON_RELEASE_MECHANICAL_SUPPORT');
		expect(index.productionWeights).toBe(false);
		expect(index.mathReviewStatus).toBe('GO_MECHANICAL_SUPPORT_NON_RELEASE');
		expect(index.mathReviewSha256).toBe(
			'd2adab47369dd2b2b8df0bfd49fb146f563bd5853b9f7ed18ba32103584af145',
		);
		expect(index.mathManifestSha256).toBe(
			'358901612ae537e42833ff3baa54095fcd739ab5e8914716af76310045694d1b',
		);
		expect(index.mathActualResultsSha256).toBe(
			'c93dbc2698e86a2bdb6b4a9ab7a55c9a5561de3ba0d4a99423e4adf20d491ec5',
		);
		expect(index.mathCheckerOutputSha256).toBe(
			'75284e1ba2253b45318d4071f9cfcd346bfb1c7848c71f6ed411d8c57d1ac147',
		);
		expect(Object.keys(index.books).sort()).toEqual([...NAMES].sort());
		expect(Object.keys(literalBooks)).toHaveLength(13);
		expect(
			Object.values(index.books).reduce((sum, book) => sum + book.checkpointStateHashes.length, 0),
		).toBe(1047);
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
			expect(prepared.finalState.mode).toBe(expected.mode);
			expect(prepared.finalState.entryKind).toBe('purchase');
			expect(prepared.finalState.paidBetAtomicUnits).toBe(250_000_000);
			expect(prepared.finalState.winner).toBe(expected.winner);
			expect(prepared.finalState.headliner).toBe(expected.headliner);
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
		45_000,
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

	it.each(GRAND_NAMES)('%s preserves three ordered starter Courses', async (name) => {
		const prepared = await prepareProductionBook(literalBook(name));
		const start = prepared.events.find((event) => event.type === 'kitchenShowdownStart');
		expect(start?.type).toBe('kitchenShowdownStart');
		if (start?.type !== 'kitchenShowdownStart') throw new Error('Missing Grand start');
		expect(start.headliner).toBeNull();
		expect(start.meters).toEqual({ italian: 75, french: 75, chinese: 75 });
		expect(start.stars).toEqual({ italian: 1, french: 1, chinese: 1 });
		expect(start.completedCourses.map((course) => course.chef)).toEqual([
			'italian',
			'french',
			'chinese',
		]);
		const eventIds = new Set(prepared.events.map((event) => event.id));
		expect(start.completedCourses.every((course) => !eventIds.has(course.sourceEventId))).toBe(
			true,
		);
	});

	it.each(MYSTERY_NAMES)(
		'%s preserves its Headliner starter, opening Service, and star two',
		async (name) => {
			const prepared = await prepareProductionBook(literalBook(name));
			const expected = index.books[name];
			const headliner = expected.headliner as ChefId;
			const startIndex = prepared.events.findIndex(
				(event) => event.type === 'kitchenShowdownStart',
			);
			const start = prepared.events[startIndex];
			expect(start?.type).toBe('kitchenShowdownStart');
			if (start?.type !== 'kitchenShowdownStart') throw new Error('Missing Mystery start');
			expect(start.headliner).toBe(headliner);
			expect(start.completedCourses).toHaveLength(1);
			expect(start.completedCourses[0]?.chef).toBe(headliner);

			const openingWindowIndex = prepared.events.findIndex(
				(event, eventIndex) =>
					eventIndex > startIndex &&
					event.type === 'serviceQueueOpened' &&
					event.phase === 'opening' &&
					event.source === 'initialReady',
			);
			expect(openingWindowIndex).toBeGreaterThan(startIndex);
			const openingWindow = prepared.events[openingWindowIndex];
			if (openingWindow?.type !== 'serviceQueueOpened') throw new Error('Missing opening queue');
			expect(openingWindow.entries.map((entry) => entry.chef)).toEqual([headliner]);
			expect(openingWindow.entries[0]?.perfectServeUnits).toBe(0);

			const openingAction = prepared.events
				.slice(openingWindowIndex + 1)
				.find((event) => event.type === SERVICE_ACTION[headliner]);
			expect(openingAction?.type).toBe(SERVICE_ACTION[headliner]);
			if (
				openingAction?.type !== 'pastaPull' &&
				openingAction?.type !== 'sauceFinish' &&
				openingAction?.type !== 'wokToss'
			)
				throw new Error('Missing Headliner action');
			expect(openingAction.chef).toBe(headliner);

			const openingCourseIndex = prepared.events.findIndex(
				(event) => event.type === 'crownCourseComplete' && event.sourceEventId === openingAction.id,
			);
			expect(openingCourseIndex).toBeGreaterThan(openingWindowIndex);
			const starTwo = prepared.events[openingCourseIndex + 1];
			expect(starTwo?.type).toBe('judgeStarUpdate');
			if (starTwo?.type !== 'judgeStarUpdate') throw new Error('Missing opening star');
			expect(starTwo.chef).toBe(headliner);
			expect(starTwo.starsAfter).toBe(2);
			expect(starTwo.stars[headliner]).toBe(2);
		},
	);

	it('keeps the French Headliner at two stars while Chinese wins the different-winner Book', async () => {
		const prepared = await prepareProductionBook(
			literalBook('mystery-profit-c10-different-winner'),
		);
		const lock = prepared.events.find((event) => event.type === 'kitchenWinnerLocked');
		expect(prepared.finalState.headliner).toBe('french');
		expect(prepared.finalState.winner).toBe('chinese');
		expect(lock?.type).toBe('kitchenWinnerLocked');
		if (lock?.type !== 'kitchenWinnerLocked') throw new Error('Missing winner lock');
		expect(lock.winner).toBe('chinese');
		expect(lock.stars).toEqual({ italian: 0, french: 2, chinese: 3 });
	});

	it.each(NAMES)('%s keeps stars immutable after winner lock', async (name) => {
		const prepared = await prepareProductionBook(literalBook(name));
		const lockIndex = prepared.events.findIndex((event) => event.type === 'kitchenWinnerLocked');
		expect(lockIndex).toBeGreaterThan(0);
		const locked = reduceProductionEvents(prepared.events.slice(0, lockIndex + 1));
		expect(
			prepared.events.slice(lockIndex + 1).some((event) => event.type === 'judgeStarUpdate'),
		).toBe(false);
		expect(prepared.finalState.stars).toEqual(locked.stars);
	});
});
