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
	'P3-12',
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
	readySequence: number;
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
			windowIndex: number;
			phase: 'opening' | null;
			source: 'initialReady' | null;
			board: Board;
			entries: readonly ServiceQueueEntry[];
	  })
	| (ProductionEventBase & {
			type: 'pastaPull';
			queueEntryId: string;
			chef: ChefId;
			positions: readonly Position[];
			boardAfter: Board;
			meterAfter: number;
	  })
	| (ProductionEventBase & {
			type: 'sauceFinish';
			queueEntryId: string;
			chef: ChefId;
			appliedSpots: readonly SauceSpot[];
			activeSpots: readonly SauceSpot[];
			meterAfter: number;
	  })
	| (ProductionEventBase & {
			type: 'wokToss';
			queueEntryId: string;
			chef: ChefId;
			positions: readonly Position[];
			targetSymbol: SymbolId;
			boardAfter: Board;
			meterAfter: number;
	  })
	| (ProductionEventBase & {
			type: 'perfectServeAward';
			queueEntryId: string;
			chef: ChefId;
			consumedOverflowUnits: number;
			payoutAtomicUnits: number;
	  })
	| (ProductionEventBase & {
			type: 'serviceQueueClosed';
			windowIndex: number;
			entryIds: readonly string[];
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
	| (ProductionEventBase & {
			type: 'freeSpinRetrigger';
			scatterPositions: readonly Position[];
			awardedFreeSpins: number;
			remainingFreeSpinsAfter: number;
	  })
	| (ProductionEventBase & ShowdownSnapshot & { type: 'freeSpinEnd' })
	| (ProductionEventBase & {
			type: 'crownCourseComplete';
			chef: ChefId;
			sourceEventId: string;
			courseId: string;
			courseValueAtomicUnits: number;
			crownPotAfterAtomicUnits: number;
			completedCoursesAfter: readonly CrownCourse[];
	  })
	| (ProductionEventBase & {
			type: 'judgeStarUpdate';
			sourceEventId: string;
			chef: ChefId;
			starsAfter: number;
			stars: StarValues;
	  })
	| (ProductionEventBase & {
			type: 'kitchenWinnerLocked';
			sourceEventId: string;
			winner: ChefId;
			stars: StarValues;
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

export const PRODUCTION_EVENT_TYPES = [
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
] as const satisfies readonly ProductionBookEvent['type'][];

export type ValidatedProductionBook = Readonly<{
	events: readonly ProductionBookEvent[];
	finalWinAtomicUnits: number;
}>;

export type ProductionReplayState = Readonly<{
	roundId: string;
	sequence: number;
	mode: GameMode;
	selectedChef: ChefId | null;
	showdownTriggered: boolean;
	entryKind: EntryKind | null;
	betAtomicUnits: number;
	paidBetAtomicUnits: number;
	maxWinAtomicUnits: number;
	board: Board;
	cascadeIndex: number;
	currentFreeSpin: number;
	remainingFreeSpins: number;
	meters: MeterValues;
	serviceQueue: readonly ServiceQueueEntry[];
	activePastaPositions: readonly Readonly<Position>[];
	activeWokPositions: readonly Readonly<Position>[];
	activeSauceSpots: readonly SauceSpot[];
	roundWinAtomicUnits: number;
	lastClusterWinAtomicUnits: number;
	lastSauceFlightMultiplier: number;
	perfectServePayoutAtomicUnits: number | null;
	bonusBankAtomicUnits: number;
	crownPotAtomicUnits: number;
	crownMultiplier: CrownMultiplier | null;
	crownPayoutAtomicUnits: number;
	completedCourses: readonly CrownCourse[];
	stars: StarValues;
	winner: ChefId | null;
	headliner: ChefId | null;
	creditedSourceIds: readonly string[];
	maxWinReached: boolean;
	totalWinAtomicUnits: number;
	finalWinAtomicUnits: number;
}>;

export type ReplayCheckpoint = Readonly<{
	roundId: string;
	sequence: number;
	bookHash: string;
	stateHash: string;
	state: ProductionReplayState;
}>;

export type PreparedProductionBook = ValidatedProductionBook &
	Readonly<{
		bookHash: string;
		finalState: ProductionReplayState;
	}>;

export type PlaybackSpeed = 'normal' | 'fast' | 'instant';

export type RecoveryRequest = Readonly<{
	roundId: string;
	afterSequence: number;
}>;
