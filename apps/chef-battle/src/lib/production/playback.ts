import { playProductionBookEvent } from './bookEventHandlerMap';
import { canonicalProductionJson, validateReplayCheckpoint } from './checkpoint';
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

function waitForPlaybackDelay(speed: PlaybackSpeed): Promise<void> {
	const delay = delayBySpeed[speed];
	return delay === 0 ? Promise.resolve() : new Promise((resolve) => setTimeout(resolve, delay));
}

function isShowdownState(state: ProductionReplayState): boolean {
	return (
		state.mode === 'kitchenShowdown' ||
		state.mode === 'grandShowdown' ||
		state.mode === 'mysteryTasting' ||
		state.currentFreeSpin > 0 ||
		state.remainingFreeSpins > 0 ||
		state.completedCourses.length > 0 ||
		state.winner !== null
	);
}

function restoreProductionState(state: ProductionReplayState): void {
	productionState.roundId = state.roundId;
	productionState.mode = state.mode;
	productionState.selectedChef = null;
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
	productionState.wokTossPositionKeys = [];
	productionState.bonusBankAtomicUnits = state.bonusBankAtomicUnits;
	productionState.showdownTriggered = isShowdownState(state);
	productionState.showdown = isShowdownState(state)
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
				entryKind:
					state.mode === 'base' || state.mode === 'extraReservation' ? 'natural' : 'purchase',
				crownMultiplier: null,
				crownPayoutAtomicUnits: null,
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
): Promise<void> {
	if (!Object.hasOwn(delayBySpeed, speed)) throw new Error('INVALID_PLAYBACK_SPEED');
	const restored = await validateReplayCheckpoint(prepared, checkpoint);
	const suffix = prepared.events.slice(checkpoint.sequence);
	if (suffix.length === 0 || suffix[0]?.sequence !== checkpoint.sequence + 1)
		throw new Error('INVALID_SUFFIX: first event must follow the checkpoint');

	resetProductionState();
	restoreProductionState(restored);
	for (const event of suffix) {
		await playProductionBookEvent(event);
		await waitForPlaybackDelay(speed);
	}
	if (
		productionState.replayState === null ||
		canonicalProductionJson(productionState.replayState) !==
			canonicalProductionJson(prepared.finalState)
	)
		throw new Error('INVALID_SUFFIX: handler replay did not reach the prepared final state');
}

export function makeRecoveryRequest(roundId: string, afterSequence: number): RecoveryRequest {
	if (roundId.length === 0 || !Number.isSafeInteger(afterSequence) || afterSequence < 0)
		throw new Error('Invalid recovery request');
	return Object.freeze({ roundId, afterSequence });
}
