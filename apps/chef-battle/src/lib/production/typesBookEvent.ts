import type { Position, SymbolId } from '../typesBookEvent';

export type GameMode =
	| 'base'
	| 'extraReservation'
	| 'signatureSpin'
	| 'kitchenShowdown'
	| 'grandShowdown'
	| 'mysteryTasting';

export type ChefId = 'italian' | 'french' | 'chinese';
export type MeterValues = Readonly<Record<ChefId, number>>;
export type Board = readonly (readonly SymbolId[])[];
export const PRODUCTION_SCENARIO_IDS = ['P3-00', 'P3-01', 'P3-02', 'P3-03', 'P3-04'] as const;
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
	| (ProductionEventBase & { type: 'serviceQueueOpened'; entries: readonly ServiceQueueEntry[] })
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
	| (ProductionEventBase & { type: 'setTotalWin'; totalWinAtomicUnits: number })
	| (ProductionEventBase & { type: 'finalWin'; payoutAtomicUnits: number });

export type ValidatedProductionBook = Readonly<{
	events: readonly ProductionBookEvent[];
	finalWinAtomicUnits: number;
}>;
