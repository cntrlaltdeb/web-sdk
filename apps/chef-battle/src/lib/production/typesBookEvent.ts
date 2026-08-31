import type { Position, SymbolId } from '../typesBookEvent';

export type GameMode =
	| 'base'
	| 'extraReservation'
	| 'signatureSpin'
	| 'kitchenShowdown'
	| 'grandShowdown'
	| 'mysteryTasting';

export type ChefId = 'italian' | 'french' | 'chinese';
export type EntryKind = 'natural' | 'purchase';
export type CrownMultiplier = 2 | 3 | 4 | 5 | 10 | 20 | 50 | 100;
export type MeterValues = Readonly<Record<ChefId, number>>;
export type StarValues = Readonly<Record<ChefId, number>>;
export type Board = readonly (readonly SymbolId[])[];
export const PRODUCTION_SCENARIO_IDS = [
	'P3-00',
	'P3-01',
	'P3-02',
	'P3-03',
	'P3-04',
	'P3-05',
	'P3-06',
	'P3-07',
	'P3-08',
	'P3-09',
	'P3-10',
	'P3-11',
] as const;
export type ProductionScenarioId = (typeof PRODUCTION_SCENARIO_IDS)[number];

type ProductionEventBase = {
	readonly id: string;
	readonly sequence: number;
	readonly roundId: string;
};

export type SauceSpot = Readonly<{ position: Position; boost: number }>;
export type ServiceQueueEntry = Readonly<{
	id: string;
	chef: ChefId;
	perfectServeUnits: number;
}>;
export type CrownCourse = Readonly<{
	id: string;
	chef: ChefId;
	sourceEventId: string;
	valueAtomicUnits: number;
}>;

export type ShowdownSnapshot = Readonly<{
	totalFreeSpins: number;
	currentFreeSpin: number;
	remainingFreeSpins: number;
	meters: MeterValues;
	stars: StarValues;
	completedCourses: readonly CrownCourse[];
	bonusBankAtomicUnits: number;
	crownPotAtomicUnits: number;
	activeSauceSpots: readonly SauceSpot[];
	winner: ChefId | null;
	headliner: ChefId | null;
}>;

export type ClusterWinEvent = ProductionEventBase & {
	type: 'clusterWin';
	chef: ChefId;
	symbol: SymbolId;
	positions: readonly Position[];
	basePayoutAtomicUnits: number;
	appliedSauceSpots: readonly SauceSpot[];
	sauceFlightMultiplier: number;
	payoutAtomicUnits: number;
};

export type RoundWinUpdateEvent = ProductionEventBase & {
	type: 'roundWinUpdate';
	sourceEventId: string;
	creditAtomicUnits: number;
	balanceAfterAtomicUnits: number;
};

export type ProductionBookEvent =
	| (ProductionEventBase & {
			type: 'roundStart';
			mode: GameMode;
			betAtomicUnits: number;
			paidBetAtomicUnits: number;
			maxWinAtomicUnits: number;
			meters: MeterValues;
			selectedChef?: ChefId;
	  })
	| (ProductionEventBase & { type: 'revealBoard'; board: Board })
	| ClusterWinEvent
	| RoundWinUpdateEvent
	| (ProductionEventBase & {
			type: 'chefMeterUpdate';
			chef: ChefId;
			earnedCharge: number;
			appliedCharge: number;
			overflowCharge: number;
			meterAfter: number;
			serviceQueueEntryId: string | null;
			perfectServeUnitsAfter: number;
	  })
	| (ProductionEventBase & { type: 'removeSymbols'; positions: readonly Position[] })
	| (ProductionEventBase & { type: 'cascade'; index: number })
	| (ProductionEventBase & { type: 'boardSettled'; board: Board })
	| (ProductionEventBase & {
			type: 'serviceQueueOpened';
			entries: readonly ServiceQueueEntry[];
			phase?: 'opening';
			source?: 'initialReady';
	  })
	| (ProductionEventBase & {
			type: 'pastaPull';
			queueEntryId: string;
			positions: readonly Position[];
			boardAfter: Board;
	  })
	| (ProductionEventBase & {
			type: 'sauceFinish';
			queueEntryId: string;
			appliedSpots: readonly SauceSpot[];
			activeSpots: readonly SauceSpot[];
	  })
	| (ProductionEventBase & {
			type: 'wokToss';
			queueEntryId: string;
			positions: readonly Position[];
			targetSymbol: SymbolId;
			boardAfter: Board;
	  })
	| (ProductionEventBase & {
			type: 'perfectServeAward';
			queueEntryId: string;
			consumedOverflowUnits: number;
			payoutAtomicUnits: number;
	  })
	| (ProductionEventBase & {
			type: 'serviceQueueClosed';
			finalBoard: Board;
	  })
	| (ProductionEventBase & {
			type: 'kitchenShowdownTriggered';
			scatterPositions: readonly Position[];
			awardedFreeSpins: number;
	  })
	| (ProductionEventBase & {
			type: 'bonusBankUpdate';
			sourceEventId: string;
			creditAtomicUnits: number;
			balanceAfterAtomicUnits: number;
	  })
	| (ProductionEventBase &
			ShowdownSnapshot & {
				type: 'kitchenShowdownStart';
				entryKind: EntryKind;
			})
	| (ProductionEventBase & {
			type: 'freeSpinStart';
			currentFreeSpin: number;
			remainingFreeSpins: number;
			board: Board;
	  })
	| (ProductionEventBase & ShowdownSnapshot & { type: 'freeSpinEnd' })
	| (ProductionEventBase & {
			type: 'crownCourseComplete';
			queueEntryId: string;
			chef: ChefId;
			sourceEventId: string;
			courseId: string;
			courseValueAtomicUnits: number;
			crownPotAfterAtomicUnits: number;
			completedCourses: readonly CrownCourse[];
	  })
	| (ProductionEventBase & {
			type: 'judgeStarUpdate';
			chef: ChefId;
			starsAfter: number;
			stars: StarValues;
	  })
	| (ProductionEventBase & {
			type: 'kitchenWinnerLocked';
			winner: ChefId;
			stars: StarValues;
			headliner: ChefId;
	  })
	| (ProductionEventBase & {
			type: 'kitchenCrownReveal';
			winner: ChefId;
			bonusBankAtomicUnits: number;
			crownPotAtomicUnits: number;
			multiplier: CrownMultiplier;
			crownPayoutAtomicUnits: number;
			finalWinAtomicUnits: number;
	  })
	| (ProductionEventBase & { type: 'maxWinReached'; maxWinAtomicUnits: number })
	| (ProductionEventBase & { type: 'setTotalWin'; totalWinAtomicUnits: number })
	| (ProductionEventBase & { type: 'finalWin'; payoutAtomicUnits: number });

export type ValidatedProductionBook = Readonly<{
	events: readonly ProductionBookEvent[];
	finalWinAtomicUnits: number;
}>;
