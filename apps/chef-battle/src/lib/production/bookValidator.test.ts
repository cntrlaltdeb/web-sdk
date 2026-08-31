import { beforeEach, describe, expect, it } from 'vitest';

import P300 from '../books/production/P3-00.json';
import { validateProductionBook } from './bookValidator';
import { productionBookEventHandlerMap } from './bookEventHandlerMap';
import { canonicalProductionJson } from './checkpoint';
import {
	loadPreparedProductionBook,
	loadProductionCheckpoint,
	playProductionBook,
	playValidatedPrefixForTest,
	playValidatedProductionBook,
} from './localBookAdapter';
import { playPreparedProductionBook, resumeProductionBook } from './playback';
import { productionState, resetProductionState } from './stateGame.svelte';
import { PRODUCTION_EVENT_TYPES, PRODUCTION_SCENARIO_IDS } from './typesBookEvent';
import type {
	PlaybackSpeed,
	ProductionScenarioId,
	ValidatedProductionBook,
} from './typesBookEvent';

type MutableBook = Array<Record<string, unknown>>;

const EXPECTED_PRODUCTION_EVENT_TYPES = [
	'roundStart',
	'revealBoard',
	'kitchenShowdownTriggered',
	'clusterWin',
	'chefMeterUpdate',
	'removeSymbols',
	'cascade',
	'boardSettled',
	'serviceQueueOpened',
	'serviceQueueClosed',
	'pastaPull',
	'sauceFinish',
	'wokToss',
	'perfectServeAward',
	'roundWinUpdate',
	'bonusBankUpdate',
	'kitchenShowdownStart',
	'freeSpinStart',
	'freeSpinEnd',
	'freeSpinRetrigger',
	'crownCourseComplete',
	'judgeStarUpdate',
	'kitchenWinnerLocked',
	'kitchenCrownReveal',
	'maxWinReached',
	'setTotalWin',
	'finalWin',
] as const;

const EXPECTED_FINAL_PAYOUT_ATOMIC_UNITS = {
	'P3-00': 0,
	'P3-01': 7_000_000,
	'P3-02': 8_500_000,
	'P3-03': 18_000_000,
	'P3-04': 7_250_000,
	'P3-05': 14_500_000,
	'P3-06': 45_750_000,
	'P3-07': 20_000_000_000,
	'P3-08': 0,
	'P3-09': 2_000_000,
	'P3-10': 30_000_000,
	'P3-11': 12_000_000,
	'P3-12': 30_000_000,
} as const satisfies Readonly<Record<ProductionScenarioId, number>>;

const PLAYBACK_SPEEDS = ['normal', 'fast', 'instant'] as const satisfies readonly PlaybackSpeed[];
const EXPECTED_PRODUCTION_CHECKPOINTS = [{ scenarioId: 'P3-12', sequence: 40 }] as const;

const cloneBook = (): MutableBook => structuredClone(P300) as MutableBook;

function applyCanonicalEnvelope(events: MutableBook): void {
	events.forEach((event, index) => {
		const sequence = index + 1;
		event.sequence = sequence;
		event.id = `P3-00-e${String(sequence).padStart(4, '0')}`;
		event.roundId = 'P3-00';
	});
}

function forgedValidatedBook(): ValidatedProductionBook {
	return {
		events: cloneBook() as unknown as ValidatedProductionBook['events'],
		finalWinAtomicUnits: 0,
	};
}

async function playAndSnapshot(
	scenarioId: ProductionScenarioId,
	speed: PlaybackSpeed,
	expectedFinalPayoutAtomicUnits: number,
): Promise<unknown> {
	const prepared = await loadPreparedProductionBook(scenarioId);
	await playPreparedProductionBook(prepared, speed);

	expect(productionState.handledSequences).toEqual(prepared.events.map((event) => event.sequence));
	expect(productionState.replayState).not.toBeNull();
	expect(canonicalProductionJson(productionState.replayState)).toBe(
		canonicalProductionJson(prepared.finalState),
	);
	if (productionState.finalWinAtomicUnits !== expectedFinalPayoutAtomicUnits)
		throw new Error(
			`${scenarioId} payout drift: expected ${expectedFinalPayoutAtomicUnits}, received ${productionState.finalWinAtomicUnits}`,
		);
	return JSON.parse(JSON.stringify(productionState));
}

describe('production Book validation', () => {
	beforeEach(resetProductionState);

	it('keeps the approved 27-event inventory exact and fully handled', () => {
		expect(PRODUCTION_EVENT_TYPES).toEqual(EXPECTED_PRODUCTION_EVENT_TYPES);
		expect(Object.keys(productionBookEventHandlerMap).sort()).toEqual(
			[...EXPECTED_PRODUCTION_EVENT_TYPES].sort(),
		);
	});

	it.each(PRODUCTION_SCENARIO_IDS)(
		'%s executes every handler with one exact final state in normal, fast and instant playback',
		async (scenarioId) => {
			const snapshots = [];
			for (const speed of PLAYBACK_SPEEDS)
				snapshots.push(
					await playAndSnapshot(scenarioId, speed, EXPECTED_FINAL_PAYOUT_ATOMIC_UNITS[scenarioId]),
				);

			expect(snapshots[1]).toEqual(snapshots[0]);
			expect(snapshots[2]).toEqual(snapshots[0]);
		},
	);

	it.each(EXPECTED_PRODUCTION_CHECKPOINTS)(
		'$scenarioId checkpoint e$sequence executes every suffix handler with exact speed parity',
		async ({ scenarioId, sequence }) => {
			const prepared = await loadPreparedProductionBook(scenarioId);
			const checkpoint = loadProductionCheckpoint(scenarioId);
			if (checkpoint === null) throw new Error(`${scenarioId} checkpoint is required`);
			expect(checkpoint.sequence).toBe(sequence);
			const snapshots = [];

			for (const speed of PLAYBACK_SPEEDS) {
				await resumeProductionBook(prepared, checkpoint, speed);
				expect(productionState.handledSequences).toEqual(
					prepared.events.slice(sequence).map((event) => event.sequence),
				);
				expect(canonicalProductionJson(productionState.replayState)).toBe(
					canonicalProductionJson(prepared.finalState),
				);
				expect(productionState.finalWinAtomicUnits).toBe(
					EXPECTED_FINAL_PAYOUT_ATOMIC_UNITS[scenarioId],
				);
				snapshots.push(JSON.parse(JSON.stringify(productionState)));
			}

			expect(snapshots[1]).toEqual(snapshots[0]);
			expect(snapshots[2]).toEqual(snapshots[0]);
		},
	);

	it('detects an exact-payout negative control after real handler playback', async () => {
		await expect(playAndSnapshot('P3-01', 'instant', 7_000_001)).rejects.toThrow(
			'P3-01 payout drift: expected 7000001, received 7000000',
		);
		expect(productionState.handledSequences).toHaveLength(14);
	});

	it('rejects a sequence gap before the first handler mutates state', async () => {
		productionState.roundId = 'keep-me';
		const invalidBook = cloneBook();
		const secondEvent = invalidBook[1];
		if (!secondEvent) throw new Error('P3-00 must contain revealBoard');
		secondEvent.sequence = 3;
		secondEvent.id = 'P3-00-e0003';

		await expect(playProductionBook(invalidBook)).rejects.toThrow('sequence');
		expect(productionState.roundId).toBe('keep-me');
		expect(productionState.handledSequences).toEqual([]);
	});

	it.each([
		['missing revealBoard', (book: MutableBook) => book.splice(1, 1)],
		['duplicate roundStart', (book: MutableBook) => book.splice(1, 0, { ...book[0] })],
		['early finalWin', (book: MutableBook) => book.splice(2, 0, { ...book.at(-1) })],
	])('rejects a noncanonical P3-00 lifecycle with %s', (_name, mutate) => {
		const invalidBook = cloneBook();
		mutate(invalidBook);
		applyCanonicalEnvelope(invalidBook);

		expect(() => validateProductionBook(invalidBook)).toThrow('exactly');
	});

	it.each([
		undefined,
		{ italian: 0, french: 0 },
		{ italian: 0, french: 0, chinese: 0, other: 0 },
		{ italian: -1, french: 0, chinese: 0 },
		{ italian: true, french: 0, chinese: 0 },
		{ italian: 0.5, french: 0, chinese: 0 },
		{ italian: 0, french: 101, chinese: 0 },
	])('rejects invalid roundStart meters: %o', (meters) => {
		const invalidBook = cloneBook();
		const roundStart = invalidBook[0];
		if (!roundStart) throw new Error('P3-00 must contain roundStart');
		roundStart.meters = meters;

		expect(() => validateProductionBook(invalidBook)).toThrow('meters');
	});

	it('rejects a structurally forged Book before reset or dispatch', async () => {
		productionState.roundId = 'keep-me';

		await expect(playValidatedProductionBook(forgedValidatedBook())).rejects.toThrow();
		expect(productionState.roundId).toBe('keep-me');
		expect(productionState.handledSequences).toEqual([]);
	});

	it('rejects a structurally forged Book before prefix dispatch', async () => {
		productionState.roundId = 'keep-me';

		await expect(playValidatedPrefixForTest(forgedValidatedBook(), 1)).rejects.toThrow();
		expect(productionState.roundId).toBe('keep-me');
		expect(productionState.handledSequences).toEqual([]);
	});
});
