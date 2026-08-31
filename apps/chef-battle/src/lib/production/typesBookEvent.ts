import type { SymbolId } from '../typesBookEvent';

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
export const PRODUCTION_SCENARIO_IDS = ['P3-00'] as const;
export type ProductionScenarioId = (typeof PRODUCTION_SCENARIO_IDS)[number];

type ProductionEventBase = {
	readonly id: string;
	readonly sequence: number;
	readonly roundId: string;
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
	| (ProductionEventBase & { type: 'setTotalWin'; totalWinAtomicUnits: number })
	| (ProductionEventBase & { type: 'finalWin'; payoutAtomicUnits: number });

export type ValidatedProductionBook = Readonly<{
	events: readonly ProductionBookEvent[];
	finalWinAtomicUnits: number;
}>;
