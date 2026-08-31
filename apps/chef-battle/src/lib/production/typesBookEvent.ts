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
export const PRODUCTION_SCENARIO_IDS = ['P3-00', 'P3-01'] as const;
export type ProductionScenarioId = (typeof PRODUCTION_SCENARIO_IDS)[number];

type ProductionEventBase = {
	readonly id: string;
	readonly sequence: number;
	readonly roundId: string;
};

export type SauceSpot = Readonly<{ position: Position; boost: number }>;

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
	| (ProductionEventBase & { type: 'setTotalWin'; totalWinAtomicUnits: number })
	| (ProductionEventBase & { type: 'finalWin'; payoutAtomicUnits: number });

export type ValidatedProductionBook = Readonly<{
	events: readonly ProductionBookEvent[];
	finalWinAtomicUnits: number;
}>;
