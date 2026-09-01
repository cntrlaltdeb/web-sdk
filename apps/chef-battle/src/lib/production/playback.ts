import { playProductionBookEvent } from './bookEventHandlerMap';
import {
	canonicalProductionJson,
	snapshotPreparedProductionBook,
	snapshotReplayCheckpoint,
	validatePreparedProductionBook,
	validateReplayCheckpoint,
} from './checkpoint';
import { productionState, resetProductionState } from './stateGame.svelte';
import type {
	PreparedProductionBook,
	PlaybackSpeed,
	ProductionReplayState,
	RecoveryRequest,
	ReplayCheckpoint,
} from './typesBookEvent';

const delayBySpeed: Readonly<Record<PlaybackSpeed, number>> = {
	normal: 2,
	fast: 1,
	instant: 0,
};

function throwIfPlaybackAborted(signal?: AbortSignal): void {
	if (signal?.aborted) throw new DOMException('Production playback aborted', 'AbortError');
}

function waitForPlaybackDelay(speed: PlaybackSpeed, signal?: AbortSignal): Promise<void> {
	const delay = delayBySpeed[speed];
	throwIfPlaybackAborted(signal);
	if (delay === 0) return Promise.resolve();
	return new Promise((resolve, reject) => {
		const onAbort = () => {
			clearTimeout(timeout);
			reject(new DOMException('Production playback aborted', 'AbortError'));
		};
		const timeout = setTimeout(() => {
			signal?.removeEventListener('abort', onAbort);
			resolve();
		}, delay);
		signal?.addEventListener('abort', onAbort, { once: true });
	});
}

export function restoreProductionState(state: ProductionReplayState): void {
	const showdownStarted =
		state.entryKind !== null &&
		(state.mode === 'kitchenShowdown' ||
			state.mode === 'grandShowdown' ||
			state.mode === 'mysteryTasting' ||
			state.currentFreeSpin > 0 ||
			state.remainingFreeSpins > 0 ||
			state.completedCourses.length > 0 ||
			state.winner !== null ||
			state.crownMultiplier !== null);
	productionState.roundId = state.roundId;
	productionState.mode = state.mode;
	productionState.selectedChef = state.selectedChef;
	productionState.headliner = state.headliner;
	productionState.betAtomicUnits = state.betAtomicUnits;
	productionState.paidBetAtomicUnits = state.paidBetAtomicUnits;
	productionState.maxWinAtomicUnits = state.maxWinAtomicUnits;
	productionState.maxWinReachedAtomicUnits = state.maxWinReached ? state.maxWinAtomicUnits : null;
	productionState.meters = { ...state.meters };
	productionState.board = state.board.map((reel) => [...reel]);
	productionState.serviceQueue = state.serviceQueue.map((entry) => ({ ...entry }));
	productionState.activeSauceSpots = state.activeSauceSpots.map((spot) => ({
		position: { ...spot.position },
		boost: spot.boost,
	}));
	productionState.pastaPullPositionKeys = state.activePastaPositions.map(
		(position) => `${position.reel}:${position.row}`,
	);
	productionState.wokTossPositionKeys = state.activeWokPositions.map(
		(position) => `${position.reel}:${position.row}`,
	);
	productionState.bonusBankAtomicUnits = state.bonusBankAtomicUnits;
	productionState.lastClusterWinAtomicUnits = state.lastClusterWinAtomicUnits;
	productionState.lastSauceFlightMultiplier = state.lastSauceFlightMultiplier;
	productionState.perfectServePayoutAtomicUnits = state.perfectServePayoutAtomicUnits;
	productionState.showdownTriggered = state.showdownTriggered;
	productionState.showdown = showdownStarted
		? {
				totalFreeSpins: state.currentFreeSpin + state.remainingFreeSpins,
				currentFreeSpin: state.currentFreeSpin,
				remainingFreeSpins: state.remainingFreeSpins,
				meters: { ...state.meters },
				stars: { ...state.stars },
				completedCourses: state.completedCourses.map((course) => ({ ...course })),
				bonusBankAtomicUnits: state.bonusBankAtomicUnits,
				crownPotAtomicUnits: state.crownPotAtomicUnits,
				activeSauceSpots: state.activeSauceSpots.map((spot) => ({
					position: { ...spot.position },
					boost: spot.boost,
				})),
				winner: state.winner,
				headliner: state.headliner,
				entryKind: state.entryKind,
				crownMultiplier: state.crownMultiplier,
				crownPayoutAtomicUnits:
					state.crownMultiplier === null ? null : state.crownPayoutAtomicUnits,
				finalWinAtomicUnits: state.finalWinAtomicUnits || null,
			}
		: null;
	productionState.roundWinAtomicUnits = state.roundWinAtomicUnits;
	productionState.cascadeIndex = state.cascadeIndex;
	productionState.totalWinAtomicUnits = state.totalWinAtomicUnits;
	productionState.finalWinAtomicUnits = state.finalWinAtomicUnits;
	productionState.replayState = state;
	productionState.recoveryPending = false;
}

export async function resumeProductionBook(
	prepared: PreparedProductionBook,
	checkpoint: ReplayCheckpoint,
	speed: PlaybackSpeed,
	signal?: AbortSignal,
): Promise<void> {
	if (!Object.hasOwn(delayBySpeed, speed)) throw new Error('INVALID_PLAYBACK_SPEED');
	const preparedSnapshot = snapshotPreparedProductionBook(prepared);
	const checkpointSnapshot = snapshotReplayCheckpoint(checkpoint);
	const restored = await validateReplayCheckpoint(preparedSnapshot, checkpointSnapshot);
	throwIfPlaybackAborted(signal);
	const suffix = preparedSnapshot.events.slice(restored.sequence);
	if (suffix.length === 0 || suffix[0]?.sequence !== restored.sequence + 1)
		throw new Error('INVALID_SUFFIX: first event must follow the checkpoint');

	resetProductionState();
	restoreProductionState(restored);
	for (const event of suffix) {
		throwIfPlaybackAborted(signal);
		await playProductionBookEvent(event);
		await waitForPlaybackDelay(speed, signal);
	}
	if (
		productionState.replayState === null ||
		canonicalProductionJson(productionState.replayState) !==
			canonicalProductionJson(preparedSnapshot.finalState)
	)
		throw new Error('INVALID_SUFFIX: handler replay did not reach the prepared final state');
}

export async function playPreparedProductionBook(
	prepared: PreparedProductionBook,
	speed: PlaybackSpeed,
	signal?: AbortSignal,
): Promise<void> {
	if (!Object.hasOwn(delayBySpeed, speed)) throw new Error('INVALID_PLAYBACK_SPEED');
	const preparedSnapshot = snapshotPreparedProductionBook(prepared);
	const expectedFinalState = await validatePreparedProductionBook(preparedSnapshot);
	throwIfPlaybackAborted(signal);

	resetProductionState();
	for (const event of preparedSnapshot.events) {
		throwIfPlaybackAborted(signal);
		await playProductionBookEvent(event);
		await waitForPlaybackDelay(speed, signal);
	}
	if (
		productionState.replayState === null ||
		canonicalProductionJson(productionState.replayState) !==
			canonicalProductionJson(expectedFinalState)
	)
		throw new Error('BOOK_STATE: handler playback did not reach the prepared final state');
}

export function makeRecoveryRequest(roundId: string, afterSequence: number): RecoveryRequest {
	if (roundId.length === 0 || !Number.isSafeInteger(afterSequence) || afterSequence < 0)
		throw new Error('Invalid recovery request');
	return Object.freeze({ roundId, afterSequence });
}
