import type { Board, GameMode, MeterValues } from './typesBookEvent';

const emptyMeters = (): MeterValues => ({ italian: 0, french: 0, chinese: 0 });

const createInitialState = () => ({
	roundId: '',
	mode: 'base' as GameMode,
	betAtomicUnits: 0,
	paidBetAtomicUnits: 0,
	maxWinAtomicUnits: 0,
	meters: emptyMeters(),
	board: [] as Board,
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
