import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import P312 from '../books/production/P3-12.json';
import P312Checkpoint from '../books/production/checkpoints/P3-12-e0040.json';
import {
	canonicalProductionJson,
	hashProductionBook,
	hashProductionReplayState,
	prepareProductionBook,
	reduceProductionEvents,
	safeDiagnostic,
} from './checkpoint';
import { makeRecoveryRequest, resumeProductionBook } from './playback';
import { validateProductionBook } from './bookValidator';
import RecoveryNotice from './components/RecoveryNotice.svelte';
import { productionState, resetProductionState } from './stateGame.svelte';
import type {
	PreparedProductionBook,
	ProductionReplayState,
	ReplayCheckpoint,
} from './typesBookEvent';

const clone = <T>(value: T): T => structuredClone(value);
const snapshotUi = (): unknown => JSON.parse(JSON.stringify(productionState));

const checkpoint = (): ReplayCheckpoint => clone(P312Checkpoint) as ReplayCheckpoint;

const prepare = async (): Promise<PreparedProductionBook> => prepareProductionBook(clone(P312));

function setMutationSentinel(): void {
	productionState.roundId = 'keep-me';
	productionState.finalWinAtomicUnits = 17;
	productionState.handledSequences.splice(0, productionState.handledSequences.length, 999);
}

function unicodeVectorState(): ProductionReplayState {
	return {
		roundId: 'раунд-🍳',
		sequence: 7,
		mode: 'grandShowdown',
		betAtomicUnits: 1_000_000,
		paidBetAtomicUnits: 250_000_000,
		maxWinAtomicUnits: 20_000_000_000,
		board: [['pizza']],
		cascadeIndex: 2,
		currentFreeSpin: 1,
		remainingFreeSpins: 12,
		meters: { chinese: 75, french: 75, italian: 75 },
		serviceQueue: [{ perfectServeUnits: 4, chef: 'french', id: 'entrée-🍜' }],
		activePastaPositions: [{ row: 2, reel: 1 }],
		activeSauceSpots: [{ boost: 9, position: { row: 4, reel: 3 } }],
		roundWinAtomicUnits: 0,
		bonusBankAtomicUnits: 123,
		crownPotAtomicUnits: 456,
		completedCourses: [
			{
				valueAtomicUnits: 456,
				sourceEventId: 'источник',
				id: 'курс-é',
				chef: 'french',
			},
		],
		stars: { chinese: 1, french: 2, italian: 1 },
		winner: 'french',
		headliner: 'french',
		creditedSourceIds: ['источник', '源'],
		maxWinReached: false,
		totalWinAtomicUnits: 0,
		finalWinAtomicUnits: 0,
	};
}

describe('production replay hashing and checkpoint contract', () => {
	beforeEach(resetProductionState);
	afterEach(cleanup);

	it('matches the Python Unicode and recursively sorted-key SHA-256 vector', async () => {
		const state = unicodeVectorState();
		expect(canonicalProductionJson(state)).toContain('раунд-🍳');
		expect(await hashProductionReplayState(state)).toBe(
			'36016118dbcd1578960c9e252b6cadfdb70e5bd207fb71bf4988367e25b91236',
		);
	});

	it('prepares the whole P3-12 Book before exposing matching Book/state hashes', async () => {
		const prepared = await prepare();
		const saved = checkpoint();

		expect(P312[39]).toMatchObject({ sequence: 40, type: 'serviceQueueClosed' });
		expect(P312[40]).toMatchObject({
			sequence: 41,
			type: 'freeSpinRetrigger',
			awardedFreeSpins: 3,
		});
		expect(prepared.bookHash).toBe(saved.bookHash);
		expect(await hashProductionBook(prepared.events)).toBe(saved.bookHash);
		expect(await hashProductionReplayState(saved.state)).toBe(saved.stateHash);
		expect(prepared.finalState.finalWinAtomicUnits).toBe(30_000_000);
	});

	it('adds exactly three spins while preserving every persistent field and clearing Pasta', () => {
		const events = clone(P312) as Array<Record<string, unknown>>;
		const retriggerIndex = events.findIndex((event) => event.type === 'freeSpinRetrigger');
		const before = reduceProductionEvents(events.slice(0, retriggerIndex));
		const after = reduceProductionEvents(events.slice(retriggerIndex, retriggerIndex + 1), before);

		expect(after.remainingFreeSpins).toBe(before.remainingFreeSpins + 3);
		for (const field of [
			'meters',
			'activeSauceSpots',
			'bonusBankAtomicUnits',
			'crownPotAtomicUnits',
			'completedCourses',
			'stars',
			'winner',
			'headliner',
		] as const)
			expect(after[field]).toEqual(before[field]);
		expect(after.activePastaPositions).toEqual([]);
	});

	it.each([2, 4])('rejects a retrigger award of %i instead of exactly three', (awarded) => {
		const events = clone(P312) as Array<Record<string, unknown>>;
		const retrigger = events.find((event) => event.type === 'freeSpinRetrigger');
		if (!retrigger) throw new Error('P3-12 retrigger required');
		retrigger.awardedFreeSpins = awarded;
		retrigger.remainingFreeSpinsAfter = 8 + awarded;

		expect(() => validateProductionBook(events)).toThrow(/retrigger|three|3/i);
	});

	it('rejects retrigger before queue close and rejects persistent snapshot drift', () => {
		const reordered = clone(P312) as Array<Record<string, unknown>>;
		const retriggerIndex = reordered.findIndex((event) => event.type === 'freeSpinRetrigger');
		[reordered[retriggerIndex - 1], reordered[retriggerIndex]] = [
			reordered[retriggerIndex]!,
			reordered[retriggerIndex - 1]!,
		];
		reordered.forEach((event, index) => {
			event.sequence = index + 1;
			event.id = `P3-12-e${String(index + 1).padStart(4, '0')}`;
		});
		expect(() => validateProductionBook(reordered)).toThrow(/retrigger|queue|free spin/i);

		const drifted = clone(P312) as Array<Record<string, unknown>>;
		const end = drifted.find(
			(event) => event.type === 'freeSpinEnd' && event.currentFreeSpin === 2,
		);
		if (!end) throw new Error('P3-12 retrigger freeSpinEnd required');
		Object.assign(end, {
			meters: { italian: 0, french: 0, chinese: 0 },
			activeSauceSpots: [],
			completedCourses: [],
			crownPotAtomicUnits: 0,
			stars: { italian: 0, french: 0, chinese: 0 },
			winner: null,
			headliner: null,
		});
		expect(() => validateProductionBook(drifted)).toThrow(/snapshot|state/i);
	});

	it.each([
		[
			'unknown event',
			(book: Array<Record<string, unknown>>) => Object.assign(book[1]!, { type: 'unknownEvent' }),
		],
		[
			'unsafe money',
			(book: Array<Record<string, unknown>>) =>
				Object.assign(book.at(-1)!, {
					payoutAtomicUnits: Number.MAX_SAFE_INTEGER + 1,
				}),
		],
	])('rejects %s during prepare with zero frontend mutation', async (_name, mutate) => {
		setMutationSentinel();
		const before = snapshotUi();
		const invalid = clone(P312) as Array<Record<string, unknown>>;
		mutate(invalid);

		await expect(prepareProductionBook(invalid)).rejects.toThrow();
		expect(snapshotUi()).toEqual(before);
	});
});

describe('production checkpoint resume', () => {
	beforeEach(resetProductionState);

	it('restores sequence 40 and dispatches exactly the suffix beginning at sequence 41', async () => {
		const prepared = await prepare();
		await resumeProductionBook(prepared, checkpoint(), 'instant');

		expect(productionState.handledSequences).toEqual(
			Array.from({ length: prepared.events.length - 40 }, (_value, index) => index + 41),
		);
		expect(productionState.finalWinAtomicUnits).toBe(prepared.finalState.finalWinAtomicUnits);
		expect(productionState.showdown?.winner).toBe(prepared.finalState.winner);
	});

	it('normal, fast and instant change only delay, never transitions or final state', async () => {
		const prepared = await prepare();
		const results: unknown[] = [];
		for (const speed of ['normal', 'fast', 'instant'] as const) {
			await resumeProductionBook(prepared, checkpoint(), speed);
			results.push(snapshotUi());
		}

		expect(results[1]).toEqual(results[0]);
		expect(results[2]).toEqual(results[0]);
	});

	it.each([
		[
			'checkpoint Book hash',
			async (saved: ReplayCheckpoint) => ({ ...saved, bookHash: '0'.repeat(64) }),
		],
		[
			'checkpoint state hash',
			async (saved: ReplayCheckpoint) => ({ ...saved, stateHash: 'f'.repeat(64) }),
		],
		[
			'checkpoint queue state',
			async (saved: ReplayCheckpoint) => {
				const state = {
					...saved.state,
					serviceQueue: [{ id: 'forged', chef: 'italian', perfectServeUnits: 0 }],
				};
				return { ...saved, state, stateHash: await hashProductionReplayState(state) };
			},
		],
		[
			'checkpoint nested state',
			async (saved: ReplayCheckpoint) => {
				const state = { ...saved.state, meters: { ...saved.state.meters, french: 99 } };
				return { ...saved, state, stateHash: await hashProductionReplayState(state) };
			},
		],
	])('rejects an altered %s before reset or handler dispatch', async (_name, alter) => {
		const prepared = await prepare();
		const forged = await alter(checkpoint());
		setMutationSentinel();
		const before = snapshotUi();

		await expect(resumeProductionBook(prepared, forged, 'instant')).rejects.toThrow();
		expect(snapshotUi()).toEqual(before);
	});

	it('rejects a valid-looking post-checkpoint event mutation through the whole-Book hash', async () => {
		const prepared = await prepare();
		const events = clone(prepared.events) as Array<Record<string, unknown>>;
		const freeSpinStart = events.find((event) => event.sequence === 43);
		if (!freeSpinStart || !Array.isArray(freeSpinStart.board))
			throw new Error('sequence 43 board required');
		const board = clone(freeSpinStart.board) as string[][];
		board[0]![0] = board[0]![0] === 'pizza' ? 'croissant' : 'pizza';
		freeSpinStart.board = board;
		const forged = { ...prepared, events } as unknown as PreparedProductionBook;
		setMutationSentinel();
		const before = snapshotUi();

		await expect(resumeProductionBook(forged, checkpoint(), 'instant')).rejects.toThrow(
			/bookHash/i,
		);
		expect(snapshotUi()).toEqual(before);
	});

	it.each([
		[
			'missing first suffix event',
			(events: Array<Record<string, unknown>>) => events.splice(40, 1),
		],
		[
			'unknown suffix event',
			(events: Array<Record<string, unknown>>) => (events[40]!.type = 'unknownEvent'),
		],
		[
			'unsafe suffix money',
			(events: Array<Record<string, unknown>>) =>
				(events.at(-1)!.payoutAtomicUnits = Number.MAX_SAFE_INTEGER + 1),
		],
	])('rejects %s before reset or handler dispatch', async (_name, alter) => {
		const prepared = await prepare();
		const events = clone(prepared.events) as Array<Record<string, unknown>>;
		alter(events);
		const forged = { ...prepared, events } as unknown as PreparedProductionBook;
		setMutationSentinel();
		const before = snapshotUi();

		await expect(resumeProductionBook(forged, checkpoint(), 'instant')).rejects.toThrow();
		expect(snapshotUi()).toEqual(before);
	});
});

describe('production recovery surface', () => {
	beforeEach(resetProductionState);
	afterEach(cleanup);

	it('builds the exact same-round recovery request without a bet payload', () => {
		expect(makeRecoveryRequest('P3-12', 40)).toEqual({ roundId: 'P3-12', afterSequence: 40 });
	});

	it('shows the exact no-new-bet recovery copy and preserves max-win notice', () => {
		productionState.recoveryPending = true;
		productionState.maxWinReachedAtomicUnits = 20_000_000_000;
		render(RecoveryNotice);

		expect(
			screen.getByText('Проверяем результат spin. Новая ставка не будет сделана.'),
		).not.toBeNull();
		expect(screen.getByText('MAX WIN REACHED — BONUS COMPLETE')).not.toBeNull();
	});

	it('returns only allowlisted diagnostics and hashes the raw round id', async () => {
		const diagnostic = await safeDiagnostic('CHECKPOINT_STATE_HASH', {
			roundId: 'raw-round-secret',
			sequence: 40,
			eventType: 'serviceQueueClosed',
			bookFingerprint: 'b'.repeat(64),
			stateFingerprint: 'c'.repeat(64),
			book: P312,
			rgs: 'must-not-leak',
			session: 'must-not-leak',
			url: 'must-not-leak',
			auth: 'must-not-leak',
			balance: 999,
		});

		expect(Object.keys(diagnostic).sort()).toEqual(
			[
				'bookFingerprint',
				'errorCode',
				'eventType',
				'roundIdHash',
				'sequence',
				'stateFingerprint',
			].sort(),
		);
		expect(JSON.stringify(diagnostic)).not.toContain('raw-round-secret');
		expect(JSON.stringify(diagnostic)).not.toContain('must-not-leak');
	});
});
