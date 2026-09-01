import { productionState } from './stateGame.svelte';
import { reduceProductionEvent } from './checkpoint';
import type { ProductionBookEvent, ShowdownSnapshot } from './typesBookEvent';

const cloneShowdownSnapshot = (snapshot: ShowdownSnapshot): ShowdownSnapshot => ({
	totalFreeSpins: snapshot.totalFreeSpins,
	currentFreeSpin: snapshot.currentFreeSpin,
	remainingFreeSpins: snapshot.remainingFreeSpins,
	meters: { ...snapshot.meters },
	stars: { ...snapshot.stars },
	completedCourses: snapshot.completedCourses.map((course) => ({ ...course })),
	bonusBankAtomicUnits: snapshot.bonusBankAtomicUnits,
	crownPotAtomicUnits: snapshot.crownPotAtomicUnits,
	activeSauceSpots: snapshot.activeSauceSpots.map((spot) => ({
		position: { ...spot.position },
		boost: spot.boost,
	})),
	winner: snapshot.winner,
	headliner: snapshot.headliner,
});

type ProductionBookEventHandlerMap = {
	[TType in ProductionBookEvent['type']]: (
		event: Extract<ProductionBookEvent, { type: TType }>,
	) => void | Promise<void>;
};

function completeVisibleService(chef: keyof typeof productionState.meters): void {
	productionState.meters = { ...productionState.meters, [chef]: 0 };
	productionState.serviceQueue = productionState.serviceQueue.slice(1);
	if (productionState.showdown) {
		productionState.showdown.meters = { ...productionState.showdown.meters, [chef]: 0 };
	}
}

function pastaPositionKeysFromBoard(board: readonly (readonly string[])[]): string[] {
	return board.flatMap((reel, reelIndex) =>
		reel.flatMap((symbol, row) => (symbol === 'pasta_wild' ? [`${reelIndex}:${row}`] : [])),
	);
}

export const productionBookEventHandlerMap = {
	roundStart: (event) => {
		productionState.roundId = event.roundId;
		productionState.mode = event.mode;
		productionState.selectedChef = event.selectedChef ?? null;
		productionState.betAtomicUnits = event.betAtomicUnits;
		productionState.paidBetAtomicUnits = event.paidBetAtomicUnits;
		productionState.maxWinAtomicUnits = event.maxWinAtomicUnits;
		productionState.meters = { ...event.meters };
	},
	revealBoard: (event) => {
		productionState.board = event.board.map((reel) => [...reel]);
		productionState.pastaPullPositionKeys = [];
	},
	clusterWin: (event) => {
		productionState.lastSauceFlightMultiplier = event.sauceFlightMultiplier;
		productionState.lastClusterWinAtomicUnits = event.payoutAtomicUnits;
	},
	roundWinUpdate: (event) => {
		productionState.roundWinAtomicUnits = event.balanceAfterAtomicUnits;
	},
	chefMeterUpdate: (event) => {
		productionState.meters = { ...productionState.meters, [event.chef]: event.meterAfter };
		if (productionState.showdown)
			productionState.showdown.meters = {
				...productionState.showdown.meters,
				[event.chef]: event.meterAfter,
			};
	},
	removeSymbols: () => {},
	cascade: (event) => {
		productionState.cascadeIndex = event.index;
	},
	boardSettled: (event) => {
		productionState.board = event.board.map((reel) => [...reel]);
		productionState.pastaPullPositionKeys = pastaPositionKeysFromBoard(event.board);
	},
	serviceQueueOpened: (event) => {
		productionState.serviceQueue = event.entries.map((entry) => ({ ...entry }));
	},
	pastaPull: (event) => {
		completeVisibleService(event.chef);
		productionState.board = event.boardAfter.map((reel) => [...reel]);
		productionState.pastaPullPositionKeys = pastaPositionKeysFromBoard(event.boardAfter);
	},
	sauceFinish: (event) => {
		completeVisibleService(event.chef);
		productionState.activeSauceSpots = event.activeSpots.map((spot) => ({
			position: { ...spot.position },
			boost: spot.boost,
		}));
		if (productionState.showdown)
			productionState.showdown.activeSauceSpots = productionState.activeSauceSpots;
	},
	wokToss: (event) => {
		completeVisibleService(event.chef);
		productionState.board = event.boardAfter.map((reel) => [...reel]);
		productionState.wokTossPositionKeys = event.positions.map(
			(position) => `${position.reel}:${position.row}`,
		);
	},
	perfectServeAward: (event) => {
		productionState.perfectServePayoutAtomicUnits = event.payoutAtomicUnits;
	},
	serviceQueueClosed: (event) => {
		productionState.board = event.finalBoard.map((reel) => [...reel]);
	},
	kitchenShowdownTriggered: () => {
		productionState.showdownTriggered = true;
	},
	bonusBankUpdate: (event) => {
		productionState.bonusBankAtomicUnits = event.balanceAfterAtomicUnits;
		if (productionState.showdown)
			productionState.showdown.bonusBankAtomicUnits = event.balanceAfterAtomicUnits;
	},
	kitchenShowdownStart: (event) => {
		const snapshot = cloneShowdownSnapshot(event);
		productionState.showdown = {
			...snapshot,
			entryKind: event.entryKind,
			crownMultiplier: null,
			crownPayoutAtomicUnits: null,
			finalWinAtomicUnits: null,
		};
		productionState.showdownTriggered = true;
		productionState.headliner = snapshot.headliner;
		productionState.bonusBankAtomicUnits = snapshot.bonusBankAtomicUnits;
		productionState.meters = { ...snapshot.meters };
		productionState.activeSauceSpots = snapshot.activeSauceSpots;
		productionState.pastaPullPositionKeys = [];
		productionState.wokTossPositionKeys = [];
	},
	freeSpinStart: (event) => {
		if (productionState.showdown) {
			productionState.showdown.currentFreeSpin = event.currentFreeSpin;
			productionState.showdown.remainingFreeSpins = event.remainingFreeSpins;
		}
		productionState.board = event.board.map((reel) => [...reel]);
	},
	freeSpinRetrigger: (event) => {
		if (productionState.showdown) {
			productionState.showdown.totalFreeSpins += event.awardedFreeSpins;
			productionState.showdown.remainingFreeSpins = event.remainingFreeSpinsAfter;
		}
		productionState.pastaPullPositionKeys = [];
		productionState.wokTossPositionKeys = [];
	},
	freeSpinEnd: (event) => {
		const previous = productionState.showdown;
		if (!previous) return;
		productionState.showdown = {
			...cloneShowdownSnapshot(event),
			entryKind: previous.entryKind,
			crownMultiplier: previous.crownMultiplier,
			crownPayoutAtomicUnits: previous.crownPayoutAtomicUnits,
			finalWinAtomicUnits: previous.finalWinAtomicUnits,
		};
		productionState.meters = { ...event.meters };
		productionState.bonusBankAtomicUnits = event.bonusBankAtomicUnits;
		productionState.activeSauceSpots = event.activeSauceSpots;
		productionState.pastaPullPositionKeys = [];
		productionState.wokTossPositionKeys = [];
	},
	crownCourseComplete: (event) => {
		if (!productionState.showdown) return;
		productionState.showdown.completedCourses = event.completedCoursesAfter.map((course) => ({
			...course,
		}));
		productionState.showdown.crownPotAtomicUnits = event.crownPotAfterAtomicUnits;
	},
	judgeStarUpdate: (event) => {
		if (productionState.showdown) productionState.showdown.stars = { ...event.stars };
	},
	kitchenWinnerLocked: (event) => {
		if (!productionState.showdown) return;
		productionState.showdown.winner = event.winner;
		productionState.showdown.stars = { ...event.stars };
	},
	kitchenCrownReveal: (event) => {
		if (!productionState.showdown) return;
		productionState.showdown.winner = event.winner;
		productionState.showdown.bonusBankAtomicUnits = event.bonusBankAtomicUnits;
		productionState.showdown.crownPotAtomicUnits = event.crownPotAtomicUnits;
		productionState.showdown.crownMultiplier = event.multiplier;
		productionState.showdown.crownPayoutAtomicUnits = event.crownPayoutAtomicUnits;
		productionState.showdown.finalWinAtomicUnits = event.finalWinAtomicUnits;
		productionState.finalWinAtomicUnits = event.finalWinAtomicUnits;
	},
	maxWinReached: (event) => {
		productionState.maxWinReachedAtomicUnits = event.maxWinAtomicUnits;
	},
	setTotalWin: (event) => {
		productionState.totalWinAtomicUnits = event.totalWinAtomicUnits;
	},
	finalWin: (event) => {
		productionState.finalWinAtomicUnits = event.payoutAtomicUnits;
		productionState.activeSauceSpots = [];
		productionState.pastaPullPositionKeys = [];
		productionState.wokTossPositionKeys = [];
	},
} satisfies ProductionBookEventHandlerMap;

export async function playProductionBookEvent(event: ProductionBookEvent): Promise<void> {
	const handler = productionBookEventHandlerMap[event.type];
	await handler(event as never);
	const replayState = productionState.replayState;
	if (
		(replayState === null && event.sequence === 1) ||
		(replayState !== null && event.sequence === replayState.sequence + 1)
	)
		productionState.replayState = reduceProductionEvent(replayState, event);
	else productionState.replayState = null;
	productionState.handledSequences.push(event.sequence);
}
