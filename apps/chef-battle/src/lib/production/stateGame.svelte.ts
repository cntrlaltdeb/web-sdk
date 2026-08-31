import type {
	Board,
	CrownMultiplier,
	EntryKind,
	GameMode,
	MeterValues,
	SauceSpot,
	ServiceQueueEntry,
	ShowdownSnapshot,
} from './typesBookEvent';

export type ProductionShowdownState = {
	-readonly [TKey in keyof ShowdownSnapshot]: ShowdownSnapshot[TKey];
} & {
	entryKind: EntryKind;
	crownMultiplier: CrownMultiplier | null;
	crownPayoutAtomicUnits: number | null;
	finalWinAtomicUnits: number | null;
};

const emptyMeters = (): MeterValues => ({ italian: 0, french: 0, chinese: 0 });

const createInitialState = () => ({
	roundId: '',
	mode: 'base' as GameMode,
	betAtomicUnits: 0,
	paidBetAtomicUnits: 0,
	maxWinAtomicUnits: 0,
	maxWinReachedAtomicUnits: null as number | null,
	meters: emptyMeters(),
	board: [] as Board,
	serviceQueue: [] as readonly ServiceQueueEntry[],
	activeSauceSpots: [] as readonly SauceSpot[],
	pastaPullPositionKeys: [] as string[],
	wokTossPositionKeys: [] as string[],
	lastSauceFlightMultiplier: 1,
	lastClusterWinAtomicUnits: 0,
	perfectServePayoutAtomicUnits: null as number | null,
	bonusBankAtomicUnits: 0,
	showdownTriggered: false,
	showdown: null as ProductionShowdownState | null,
	roundWinAtomicUnits: 0,
	cascadeIndex: 0,
	totalWinAtomicUnits: 0,
	finalWinAtomicUnits: 0,
	handledSequences: [] as number[],
});

export const productionState = $state(createInitialState());

export function resetProductionState(): void {
	Object.assign(productionState, createInitialState());
}
