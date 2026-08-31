import { validateProductionBook } from './bookValidator';
import type { Position } from '../typesBookEvent';
import type {
	CrownCourse,
	PreparedProductionBook,
	ProductionBookEvent,
	ProductionReplayState,
	ReplayCheckpoint,
	SauceSpot,
	ServiceQueueEntry,
} from './typesBookEvent';

type JsonObject = Readonly<Record<string, unknown>>;
const SAFE_DIAGNOSTIC_CODES = new Set([
	'BOOK_HASH',
	'BOOK_STATE',
	'CHECKPOINT_BOOK_HASH',
	'CHECKPOINT_STATE_HASH',
	'CHECKPOINT_STATE',
	'CHECKPOINT_SEQUENCE',
	'INVALID_BOOK',
	'INVALID_SUFFIX',
]);
const SAFE_EVENT_TYPES = new Set<ProductionBookEvent['type']>([
	'roundStart',
	'revealBoard',
	'clusterWin',
	'roundWinUpdate',
	'chefMeterUpdate',
	'removeSymbols',
	'cascade',
	'boardSettled',
	'serviceQueueOpened',
	'pastaPull',
	'sauceFinish',
	'wokToss',
	'perfectServeAward',
	'serviceQueueClosed',
	'kitchenShowdownTriggered',
	'bonusBankUpdate',
	'kitchenShowdownStart',
	'freeSpinStart',
	'freeSpinRetrigger',
	'freeSpinEnd',
	'crownCourseComplete',
	'judgeStarUpdate',
	'kitchenWinnerLocked',
	'kitchenCrownReveal',
	'maxWinReached',
	'setTotalWin',
	'finalWin',
]);
const SHA256_HEX = /^[0-9a-f]{64}$/;

function replayError(code: string, message: string): never {
	throw new Error(`${code}: ${message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function canonicalFragment(value: unknown): string {
	if (value === null || typeof value === 'boolean' || typeof value === 'string')
		return JSON.stringify(value);
	if (typeof value === 'number') {
		if (!Number.isSafeInteger(value))
			replayError('INVALID_CANONICAL_JSON', 'numbers must be safe integers');
		return String(value);
	}
	if (Array.isArray(value)) return `[${value.map(canonicalFragment).join(',')}]`;
	if (isRecord(value))
		return `{${Object.keys(value)
			.sort()
			.map((key) => `${JSON.stringify(key)}:${canonicalFragment(value[key])}`)
			.join(',')}}`;
	replayError('INVALID_CANONICAL_JSON', `unsupported value ${typeof value}`);
}

export function canonicalProductionJson(value: unknown): string {
	return canonicalFragment(value);
}

async function sha256Text(value: string): Promise<string> {
	const bytes = new TextEncoder().encode(value);
	const digest = await crypto.subtle.digest('SHA-256', bytes);
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function hashCanonical(value: unknown): Promise<string> {
	return sha256Text(canonicalProductionJson(value));
}

export async function hashProductionBook(
	events: readonly ProductionBookEvent[] | readonly JsonObject[],
): Promise<string> {
	return hashCanonical(events);
}

export async function hashProductionReplayState(state: ProductionReplayState): Promise<string> {
	return hashCanonical(state);
}

function freezeDeep<T>(value: T): T {
	if (Array.isArray(value)) value.forEach(freezeDeep);
	else if (isRecord(value)) Object.values(value).forEach(freezeDeep);
	return Object.freeze(value);
}

function cloneBoard(board: ProductionReplayState['board']): ProductionReplayState['board'] {
	return board.map((reel) => [...reel]);
}

function clonePositions(positions: readonly Position[]): readonly Readonly<Position>[] {
	return positions.map((position) => ({ reel: position.reel, row: position.row }));
}

function cloneSauceSpots(spots: readonly SauceSpot[]): readonly SauceSpot[] {
	return spots.map((spot) => ({
		position: { reel: spot.position.reel, row: spot.position.row },
		boost: spot.boost,
	}));
}

function cloneQueue(entries: readonly ServiceQueueEntry[]): readonly ServiceQueueEntry[] {
	return entries.map((entry) => ({
		id: entry.id,
		chef: entry.chef,
		perfectServeUnits: entry.perfectServeUnits,
	}));
}

function cloneCourses(courses: readonly CrownCourse[]): readonly CrownCourse[] {
	return courses.map((course) => ({
		id: course.id,
		chef: course.chef,
		sourceEventId: course.sourceEventId,
		valueAtomicUnits: course.valueAtomicUnits,
	}));
}

function cloneReplayState(state: ProductionReplayState): ProductionReplayState {
	return {
		roundId: state.roundId,
		sequence: state.sequence,
		mode: state.mode,
		betAtomicUnits: state.betAtomicUnits,
		paidBetAtomicUnits: state.paidBetAtomicUnits,
		maxWinAtomicUnits: state.maxWinAtomicUnits,
		board: cloneBoard(state.board),
		cascadeIndex: state.cascadeIndex,
		currentFreeSpin: state.currentFreeSpin,
		remainingFreeSpins: state.remainingFreeSpins,
		meters: { ...state.meters },
		serviceQueue: cloneQueue(state.serviceQueue),
		activePastaPositions: clonePositions(state.activePastaPositions),
		activeSauceSpots: cloneSauceSpots(state.activeSauceSpots),
		roundWinAtomicUnits: state.roundWinAtomicUnits,
		bonusBankAtomicUnits: state.bonusBankAtomicUnits,
		crownPotAtomicUnits: state.crownPotAtomicUnits,
		completedCourses: cloneCourses(state.completedCourses),
		stars: { ...state.stars },
		winner: state.winner,
		headliner: state.headliner,
		creditedSourceIds: [...state.creditedSourceIds],
		maxWinReached: state.maxWinReached,
		totalWinAtomicUnits: state.totalWinAtomicUnits,
		finalWinAtomicUnits: state.finalWinAtomicUnits,
	};
}

function assertContinuation(state: ProductionReplayState, event: ProductionBookEvent): void {
	if (event.roundId !== state.roundId || event.sequence !== state.sequence + 1)
		replayError('INVALID_SUFFIX', 'round and sequence must continue the restored prefix');
}

function sameSnapshot(
	state: ProductionReplayState,
	event: Extract<ProductionBookEvent, { type: 'freeSpinEnd' }>,
): boolean {
	return (
		event.currentFreeSpin === state.currentFreeSpin &&
		event.remainingFreeSpins === state.remainingFreeSpins &&
		canonicalProductionJson(event.meters) === canonicalProductionJson(state.meters) &&
		canonicalProductionJson(event.stars) === canonicalProductionJson(state.stars) &&
		canonicalProductionJson(event.completedCourses) ===
			canonicalProductionJson(state.completedCourses) &&
		event.bonusBankAtomicUnits === state.bonusBankAtomicUnits &&
		event.crownPotAtomicUnits === state.crownPotAtomicUnits &&
		canonicalProductionJson(event.activeSauceSpots) ===
			canonicalProductionJson(state.activeSauceSpots) &&
		event.winner === state.winner &&
		event.headliner === state.headliner
	);
}

export function reduceProductionEvent(
	state: ProductionReplayState | null,
	event: ProductionBookEvent,
): ProductionReplayState {
	if (state === null) {
		if (event.type !== 'roundStart' || event.sequence !== 1)
			replayError('INVALID_BOOK', 'reduction must start with sequence 1 roundStart');
		return freezeDeep({
			roundId: event.roundId,
			sequence: event.sequence,
			mode: event.mode,
			betAtomicUnits: event.betAtomicUnits,
			paidBetAtomicUnits: event.paidBetAtomicUnits,
			maxWinAtomicUnits: event.maxWinAtomicUnits,
			board: [],
			cascadeIndex: 0,
			currentFreeSpin: 0,
			remainingFreeSpins: 0,
			meters: { ...event.meters },
			serviceQueue: [],
			activePastaPositions: [],
			activeSauceSpots: [],
			roundWinAtomicUnits: 0,
			bonusBankAtomicUnits: 0,
			crownPotAtomicUnits: 0,
			completedCourses: [],
			stars: { italian: 0, french: 0, chinese: 0 },
			winner: null,
			headliner: null,
			creditedSourceIds: [],
			maxWinReached: false,
			totalWinAtomicUnits: 0,
			finalWinAtomicUnits: 0,
		});
	}

	assertContinuation(state, event);
	const next = cloneReplayState(state) as {
		-readonly [TKey in keyof ProductionReplayState]: ProductionReplayState[TKey];
	};
	next.sequence = event.sequence;
	switch (event.type) {
		case 'roundStart':
			replayError('INVALID_BOOK', 'roundStart may appear only at sequence 1');
		case 'revealBoard':
		case 'boardSettled':
			next.board = cloneBoard(event.board);
			break;
		case 'roundWinUpdate':
			next.roundWinAtomicUnits = event.balanceAfterAtomicUnits;
			next.creditedSourceIds = [...next.creditedSourceIds, event.sourceEventId];
			break;
		case 'bonusBankUpdate':
			next.bonusBankAtomicUnits = event.balanceAfterAtomicUnits;
			next.creditedSourceIds = [...next.creditedSourceIds, event.sourceEventId];
			break;
		case 'chefMeterUpdate': {
			next.meters = { ...next.meters, [event.chef]: event.meterAfter };
			if (event.serviceQueueEntryId !== null) {
				const entry = {
					id: event.serviceQueueEntryId,
					chef: event.chef,
					perfectServeUnits: event.perfectServeUnitsAfter,
				};
				const queue = cloneQueue(next.serviceQueue) as ServiceQueueEntry[];
				const existing = queue.findIndex((queued) => queued.id === entry.id);
				if (existing < 0) queue.push(entry);
				else queue[existing] = entry;
				next.serviceQueue = queue;
			}
			break;
		}
		case 'cascade':
			next.cascadeIndex = event.index;
			break;
		case 'serviceQueueOpened':
			next.serviceQueue = cloneQueue(event.entries);
			break;
		case 'pastaPull':
			next.board = cloneBoard(event.boardAfter);
			next.activePastaPositions = clonePositions(event.positions);
			break;
		case 'sauceFinish':
			next.activeSauceSpots = cloneSauceSpots(event.activeSpots);
			break;
		case 'wokToss':
			next.board = cloneBoard(event.boardAfter);
			break;
		case 'serviceQueueClosed': {
			const meters = { ...next.meters };
			for (const entry of next.serviceQueue) meters[entry.chef] = 0;
			next.board = cloneBoard(event.finalBoard);
			next.meters = meters;
			next.serviceQueue = [];
			break;
		}
		case 'kitchenShowdownStart':
			next.board = [];
			next.currentFreeSpin = event.currentFreeSpin;
			next.remainingFreeSpins = event.remainingFreeSpins;
			next.meters = { ...event.meters };
			next.serviceQueue = [];
			next.activePastaPositions = [];
			next.activeSauceSpots = cloneSauceSpots(event.activeSauceSpots);
			next.bonusBankAtomicUnits = event.bonusBankAtomicUnits;
			next.crownPotAtomicUnits = event.crownPotAtomicUnits;
			next.completedCourses = cloneCourses(event.completedCourses);
			next.stars = { ...event.stars };
			next.winner = event.winner;
			next.headliner = event.headliner;
			break;
		case 'freeSpinStart':
			next.board = cloneBoard(event.board);
			next.currentFreeSpin = event.currentFreeSpin;
			next.remainingFreeSpins = event.remainingFreeSpins;
			next.activePastaPositions = [];
			break;
		case 'freeSpinRetrigger':
			if (
				event.awardedFreeSpins !== 3 ||
				event.remainingFreeSpinsAfter !== next.remainingFreeSpins + 3 ||
				next.serviceQueue.length !== 0
			)
				replayError(
					'INVALID_BOOK',
					'freeSpinRetrigger must add exactly three after a drained queue',
				);
			next.remainingFreeSpins = event.remainingFreeSpinsAfter;
			next.activePastaPositions = [];
			break;
		case 'freeSpinEnd':
			if (!sameSnapshot(next, event))
				replayError('INVALID_BOOK', 'freeSpinEnd snapshot does not match reducer state');
			next.activePastaPositions = [];
			break;
		case 'crownCourseComplete':
			next.crownPotAtomicUnits = event.crownPotAfterAtomicUnits;
			next.completedCourses = cloneCourses(event.completedCourses);
			break;
		case 'judgeStarUpdate':
			next.stars = { ...event.stars };
			break;
		case 'kitchenWinnerLocked':
			next.stars = { ...event.stars };
			next.winner = event.winner;
			next.headliner = event.headliner;
			break;
		case 'kitchenCrownReveal':
			next.bonusBankAtomicUnits = event.bonusBankAtomicUnits;
			next.crownPotAtomicUnits = event.crownPotAtomicUnits;
			next.winner = event.winner;
			next.finalWinAtomicUnits = event.finalWinAtomicUnits;
			break;
		case 'maxWinReached':
			next.maxWinReached = true;
			break;
		case 'setTotalWin':
			next.totalWinAtomicUnits = event.totalWinAtomicUnits;
			break;
		case 'finalWin':
			next.finalWinAtomicUnits = event.payoutAtomicUnits;
			next.serviceQueue = [];
			next.activePastaPositions = [];
			next.activeSauceSpots = [];
			break;
		case 'clusterWin':
		case 'removeSymbols':
		case 'perfectServeAward':
		case 'kitchenShowdownTriggered':
			break;
		default:
			replayError('INVALID_BOOK', `unknown event type ${(event as ProductionBookEvent).type}`);
	}
	return freezeDeep(next);
}

export function reduceProductionEvents(
	events: readonly ProductionBookEvent[] | readonly JsonObject[],
	initialState: ProductionReplayState | null = null,
): ProductionReplayState {
	if (events.length === 0) {
		if (initialState === null) replayError('INVALID_BOOK', 'event sequence must not be empty');
		return freezeDeep(cloneReplayState(initialState));
	}
	let state = initialState === null ? null : freezeDeep(cloneReplayState(initialState));
	for (const event of events) state = reduceProductionEvent(state, event as ProductionBookEvent);
	if (state === null) replayError('INVALID_BOOK', 'event sequence did not produce state');
	return state;
}

export async function prepareProductionBook(value: unknown): Promise<PreparedProductionBook> {
	const validated = validateProductionBook(value);
	const bookHash = await hashProductionBook(validated.events);
	const finalState = reduceProductionEvents(validated.events);
	if (
		finalState.finalWinAtomicUnits !== validated.finalWinAtomicUnits ||
		finalState.sequence !== validated.events.length
	)
		replayError('BOOK_STATE', 'full reducer does not match the validated terminal payout');
	return freezeDeep({
		events: validated.events,
		finalWinAtomicUnits: validated.finalWinAtomicUnits,
		bookHash,
		finalState,
	});
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
	const actual = Object.keys(value).sort();
	const expected = [...keys].sort();
	return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function assertCheckpointEnvelope(value: unknown): asserts value is ReplayCheckpoint {
	if (
		!isRecord(value) ||
		!hasExactKeys(value, ['roundId', 'sequence', 'bookHash', 'stateHash', 'state']) ||
		typeof value.roundId !== 'string' ||
		!Number.isSafeInteger(value.sequence) ||
		typeof value.bookHash !== 'string' ||
		typeof value.stateHash !== 'string' ||
		!isRecord(value.state)
	)
		replayError('CHECKPOINT_STATE', 'checkpoint envelope is invalid');
}

export async function validatePreparedProductionBook(
	prepared: PreparedProductionBook,
): Promise<ProductionReplayState> {
	const validated = validateProductionBook(prepared.events);
	const actualBookHash = await hashProductionBook(validated.events);
	if (actualBookHash !== prepared.bookHash) replayError('BOOK_HASH', 'bookHash mismatch');
	const finalState = reduceProductionEvents(validated.events);
	if (
		validated.finalWinAtomicUnits !== prepared.finalWinAtomicUnits ||
		canonicalProductionJson(finalState) !== canonicalProductionJson(prepared.finalState)
	)
		replayError('BOOK_STATE', 'prepared final reducer state mismatch');
	return finalState;
}

export async function validateReplayCheckpoint(
	prepared: PreparedProductionBook,
	value: unknown,
): Promise<ProductionReplayState> {
	await validatePreparedProductionBook(prepared);
	assertCheckpointEnvelope(value);
	const checkpoint = value;
	if (checkpoint.bookHash !== prepared.bookHash)
		replayError('CHECKPOINT_BOOK_HASH', 'checkpoint bookHash mismatch');
	if (
		checkpoint.sequence < 1 ||
		checkpoint.sequence >= prepared.events.length ||
		checkpoint.state.sequence !== checkpoint.sequence
	)
		replayError('CHECKPOINT_SEQUENCE', 'checkpoint sequence is not a resumable prefix');
	const bookRoundId = prepared.events[0]?.roundId;
	if (checkpoint.roundId !== bookRoundId || checkpoint.state.roundId !== checkpoint.roundId)
		replayError('CHECKPOINT_STATE', 'checkpoint roundId mismatch');
	const actualStateHash = await hashProductionReplayState(checkpoint.state);
	if (actualStateHash !== checkpoint.stateHash)
		replayError('CHECKPOINT_STATE_HASH', 'checkpoint stateHash mismatch');
	const expected = reduceProductionEvents(prepared.events.slice(0, checkpoint.sequence));
	if (canonicalProductionJson(checkpoint.state) !== canonicalProductionJson(expected))
		replayError('CHECKPOINT_STATE', 'checkpoint full state mismatch');
	if ((await hashProductionReplayState(expected)) !== checkpoint.stateHash)
		replayError('CHECKPOINT_STATE_HASH', 'checkpoint canonical state fingerprint mismatch');
	const suffix = prepared.events.slice(checkpoint.sequence);
	if (suffix.length === 0 || suffix[0]?.sequence !== checkpoint.sequence + 1)
		replayError('INVALID_SUFFIX', 'suffix must start at checkpoint sequence plus one');
	const resumed = reduceProductionEvents(suffix, expected);
	if (canonicalProductionJson(resumed) !== canonicalProductionJson(prepared.finalState))
		replayError('INVALID_SUFFIX', 'suffix final state does not match the full reducer');
	return expected;
}

export type SafeDiagnostic = Readonly<{
	errorCode: string;
	roundIdHash: string;
	sequence?: number;
	eventType?: string;
	bookFingerprint?: string;
	stateFingerprint?: string;
}>;

export async function safeDiagnostic(
	errorCode: string,
	context: Readonly<Record<string, unknown>>,
): Promise<SafeDiagnostic> {
	const safeErrorCode = SAFE_DIAGNOSTIC_CODES.has(errorCode) ? errorCode : 'UNKNOWN_REPLAY_ERROR';
	const result: {
		errorCode: string;
		roundIdHash: string;
		sequence?: number;
		eventType?: string;
		bookFingerprint?: string;
		stateFingerprint?: string;
	} = {
		errorCode: safeErrorCode,
		roundIdHash: await sha256Text(typeof context.roundId === 'string' ? context.roundId : ''),
	};
	if (Number.isSafeInteger(context.sequence)) result.sequence = context.sequence as number;
	if (
		typeof context.eventType === 'string' &&
		SAFE_EVENT_TYPES.has(context.eventType as ProductionBookEvent['type'])
	)
		result.eventType = context.eventType;
	if (typeof context.bookFingerprint === 'string' && SHA256_HEX.test(context.bookFingerprint))
		result.bookFingerprint = context.bookFingerprint;
	if (typeof context.stateFingerprint === 'string' && SHA256_HEX.test(context.stateFingerprint))
		result.stateFingerprint = context.stateFingerprint;
	return freezeDeep(result);
}
