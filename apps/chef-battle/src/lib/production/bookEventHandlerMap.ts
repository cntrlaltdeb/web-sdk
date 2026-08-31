import { productionState } from './stateGame.svelte';
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
	},
	serviceQueueOpened: (event) => {
		productionState.serviceQueue = event.entries.map((entry) => ({ ...entry }));
	},
	pastaPull: (event) => {
		productionState.board = event.boardAfter.map((reel) => [...reel]);
		productionState.pastaPullPositionKeys = event.positions.map(
			(position) => `${position.reel}:${position.row}`,
		);
	},
	sauceFinish: (event) => {
		productionState.activeSauceSpots = event.activeSpots.map((spot) => ({
			position: { ...spot.position },
			boost: spot.boost,
		}));
		if (productionState.showdown)
			productionState.showdown.activeSauceSpots = productionState.activeSauceSpots;
	},
	wokToss: (event) => {
		productionState.board = event.boardAfter.map((reel) => [...reel]);
		productionState.wokTossPositionKeys = event.positions.map(
			(position) => `${position.reel}:${position.row}`,
		);
	},
	perfectServeAward: (event) => {
		productionState.perfectServePayoutAtomicUnits = event.payoutAtomicUnits;
	},
	serviceQueueClosed: (event) => {
		const meters = { ...productionState.meters };
		for (const entry of productionState.serviceQueue) meters[entry.chef] = 0;
		productionState.meters = meters;
		if (productionState.showdown) productionState.showdown.meters = { ...meters };
		productionState.board = event.finalBoard.map((reel) => [...reel]);
		productionState.serviceQueue = [];
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
		productionState.showdown.completedCourses = event.completedCourses.map((course) => ({
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
		productionState.showdown.headliner = event.headliner;
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
	productionState.handledSequences.push(event.sequence);
}
