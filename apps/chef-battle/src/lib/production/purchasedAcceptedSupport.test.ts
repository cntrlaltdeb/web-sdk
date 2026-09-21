import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';

import index from './__fixtures__/purchased-accepted-support/index.json';
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

const literalBooks = import.meta.glob('./__fixtures__/purchased-accepted-support/books/*.json', {
	query: '?raw',
	import: 'default',
	eager: true,
});
const CROWN_WINNER_NAMES = [
	'ks-crown-winner-c2-italian',
	'ks-crown-winner-c2-chinese',
	'ks-crown-winner-c3-french',
	'ks-crown-winner-c3-chinese',
	'ks-crown-winner-c4-italian',
	'ks-crown-winner-c4-chinese',
	'ks-crown-winner-c5-italian',
	'ks-crown-winner-c5-french',
	'ks-crown-winner-c10-italian',
	'ks-crown-winner-c10-chinese',
	'ks-crown-winner-c20-italian',
	'ks-crown-winner-c20-chinese',
	'ks-crown-winner-c50-italian',
	'ks-crown-winner-c50-chinese',
	'ks-crown-winner-c100-italian',
	'ks-crown-winner-c100-chinese',
	'grand-crown-winner-c2-italian',
	'grand-crown-winner-c2-chinese',
	'grand-crown-winner-c3-french',
	'grand-crown-winner-c3-chinese',
	'grand-crown-winner-c4-italian',
	'grand-crown-winner-c4-french',
	'grand-crown-winner-c5-italian',
	'grand-crown-winner-c5-chinese',
	'grand-crown-winner-c10-italian',
	'grand-crown-winner-c10-chinese',
	'grand-crown-winner-c20-italian',
	'grand-crown-winner-c20-chinese',
	'grand-crown-winner-c50-french',
	'grand-crown-winner-c50-chinese',
	'grand-crown-winner-c100-italian',
	'mystery-crown-winner-c2-italian',
	'mystery-crown-winner-c2-chinese',
	'mystery-crown-winner-c3-italian',
	'mystery-crown-winner-c3-chinese',
	'mystery-crown-winner-c4-french',
	'mystery-crown-winner-c4-chinese',
	'mystery-crown-winner-c5-italian',
	'mystery-crown-winner-c5-french',
	'mystery-crown-winner-c10-italian',
	'mystery-crown-winner-c10-french',
	'mystery-crown-winner-c20-french',
	'mystery-crown-winner-c20-chinese',
	'mystery-crown-winner-c50-italian',
	'mystery-crown-winner-c50-chinese',
	'mystery-crown-winner-c100-italian',
] as const;
const JOINT_GAP_NAMES = ['ks-feature-c5-french-joint', 'mystery-profit-c2-french-joint'] as const;
const LOW_RETURN_NAMES = ['ks-partial-c2-chinese-gap', 'mystery-small-c5-french-gap'] as const;
const NAMES = [...CROWN_WINNER_NAMES, ...JOINT_GAP_NAMES, ...LOW_RETURN_NAMES] as const;
const SPEEDS = ['normal', 'fast', 'instant'] as const;

/** Read a fresh copy of one independently accepted NON_RELEASE purchased Book. */
function literalBook(name: (typeof NAMES)[number]): unknown {
	const raw = literalBooks['./__fixtures__/purchased-accepted-support/books/' + name + '.json'];
	if (typeof raw !== 'string') throw new Error('Missing accepted support fixture: ' + name);
	return JSON.parse(raw);
}

function mutableBook(name: (typeof NAMES)[number]): Array<Record<string, unknown>> {
	return literalBook(name) as Array<Record<string, unknown>>;
}

describe('50 newly accepted purchased Books Math/Web parity (NON_RELEASE)', () => {
	beforeEach(resetProductionState);
	afterEach(cleanup);

	it('binds exactly 50 newly accepted Books and 3974 canonical Python replay states', () => {
		expect(index.classification).toBe('NON_RELEASE_MECHANICAL_SUPPORT');
		expect(index.productionWeights).toBe(false);
		expect(index.cumulativePurchasedCatalogueBooks).toBe(82);
		expect(index.counts).toEqual({ books: 50, events: 4024, resumablePrefixes: 3974 });
		expect(index.previouslyCoveredBooks).toBe(32);
		expect(index.packages.crownWinner).toMatchObject({
			books: 46,
			events: 3688,
			resumablePrefixes: 3642,
			mathReviewSha256: '8d28e0697a7e764928571c06c8632b092d481f5f404e038967e44f617c81b74f',
		});
		expect(index.packages.jointGap).toMatchObject({
			books: 2,
			events: 207,
			resumablePrefixes: 205,
			mathReviewSha256: 'f987c65972dea5c60a17a33c2d180bffc97a53baf6113c81f7646cae2c4b09be',
		});
		expect(index.packages.lowReturn).toMatchObject({
			books: 2,
			events: 129,
			resumablePrefixes: 127,
			mathReviewSha256: '1ab2fdcbb2fe3fbdf5dc23d09514af88c35dcc463ec5d5f8d8cc930b93aed037',
		});
		expect(Object.keys(index.books).sort()).toEqual([...NAMES].sort());
		expect(Object.keys(literalBooks)).toHaveLength(50);
		expect(
			Object.values(index.books).reduce((sum, book) => sum + book.checkpointStateHashes.length, 0),
		).toBe(3974);
	});

	it('preserves the independently accepted 16/15/15 Crown-winner support composition', () => {
		const rows = CROWN_WINNER_NAMES.map((name) => index.books[name]);
		expect(rows.filter((row) => row.mode === 'kitchenShowdown')).toHaveLength(16);
		expect(rows.filter((row) => row.mode === 'grandShowdown')).toHaveLength(15);
		expect(rows.filter((row) => row.mode === 'mysteryTasting')).toHaveLength(15);
		expect(
			new Set(rows.map((row) => `${row.mode}:${row.winner}:${row.crownMultiplier}`)).size,
		).toBe(46);
	});

	it.each(NAMES)(
		'%s matches its Math Book and every resumable Python state',
		async (name) => {
			const expected = index.books[name];
			const prepared = await prepareProductionBook(literalBook(name));
			expect(prepared.bookHash).toBe(expected.bookHash);
			expect(prepared.events).toHaveLength(expected.eventCount);
			expect(prepared.finalWinAtomicUnits).toBe(expected.finalWinAtomicUnits);
			expect(await hashProductionReplayState(prepared.finalState)).toBe(expected.finalStateHash);
			expect(prepared.finalState.mode).toBe(expected.mode);
			expect(prepared.finalState.entryKind).toBe('purchase');
			expect(prepared.finalState.paidBetAtomicUnits).toBe(
				expected.mode === 'kitchenShowdown' ? 100_000_000 : 250_000_000,
			);
			expect(prepared.finalState.winner).toBe(expected.winner);
			expect(prepared.finalState.headliner).toBe(expected.headliner);
			expect(prepared.finalState.stars).toHaveProperty(expected.winner, 3);
			expect(prepared.finalState.crownMultiplier).toBe(expected.crownMultiplier);
			expect(prepared.finalState.maxWinReached).toBe(false);
			expect(prepared.finalState.remainingFreeSpins).toBe(0);
			expect(prepared.finalState.serviceQueue).toEqual([]);
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
		60_000,
	);

	it.each(NAMES)('%s resumes its accepted checkpoint at all three speeds', async (name) => {
		const expected = index.books[name];
		const prepared = await prepareProductionBook(literalBook(name));
		const state = reduceProductionEvents(prepared.events.slice(0, expected.checkpointSequence));
		expect(await hashProductionReplayState(state)).toBe(expected.checkpointStateHash);
		const saved = {
			roundId: state.roundId,
			sequence: expected.checkpointSequence,
			bookHash: expected.bookHash,
			stateHash: expected.checkpointStateHash,
			state,
		};
		for (const speed of SPEEDS) {
			await validateReplayCheckpoint(prepared, saved);
			await resumeProductionBook(prepared, saved, speed);
			expect(productionState.finalWinAtomicUnits).toBe(expected.finalWinAtomicUnits);
			expect(canonicalProductionJson(productionState.replayState)).toBe(
				canonicalProductionJson(prepared.finalState),
			);
		}
	});

	it.each(NAMES)(
		'%s plays its exact payout at three speeds and renders the result',
		async (name) => {
			const expected = index.books[name];
			const prepared = await prepareProductionBook(literalBook(name));
			for (const speed of SPEEDS) {
				await playPreparedProductionBook(prepared, speed);
				expect(productionState.handledSequences).toEqual(
					prepared.events.map((event) => event.sequence),
				);
				expect(productionState.finalWinAtomicUnits).toBe(expected.finalWinAtomicUnits);
				expect(canonicalProductionJson(productionState.replayState)).toBe(
					canonicalProductionJson(prepared.finalState),
				);
			}
			render(ProductionRound);
			expect(screen.getByText('Final win: ' + expected.finalWinAtomicUnits)).not.toBeNull();
		},
	);

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

	it.each([
		['paid purchase cost', 'grand-crown-winner-c2-italian', 'roundStart', 'paidBetAtomicUnits'],
		['Crown selection', 'ks-feature-c5-french-joint', 'kitchenCrownReveal', 'multiplier'],
		['winner identity', 'ks-partial-c2-chinese-gap', 'kitchenCrownReveal', 'winner'],
	] as const)('rejects a literal %s mutation', async (_label, name, eventType, field) => {
		const book = mutableBook(name);
		const event = book.find((candidate) => candidate.type === eventType);
		if (!event) throw new Error('Missing mutation target: ' + eventType);
		event[field] = field === 'winner' ? 'italian' : Number(event[field]) + 1;
		await expect(prepareProductionBook(book)).rejects.toThrow();
	});
});
