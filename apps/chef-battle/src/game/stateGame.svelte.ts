import type { GridCell } from './types';
import type { ChefId, MeterValues, SauceSpot } from '../lib/typesBookEvent';

const createEmptyMeters = (): MeterValues => ({ italian: 0, french: 0, chinese: 0 });
const createEmptyStars = (): Record<ChefId, number> => ({ italian: 0, french: 0, chinese: 0 });

const createInitialState = () => ({
	board: [] as GridCell[],
	meters: createEmptyMeters(),
	judgeStars: createEmptyStars(),
	roundId: '',
	betAtomicUnits: 0,
	cascadeIndex: 0,
	boardVersion: 0,
	lastMeterAmount: 0,
	clusterWinAtomicUnits: 0,
	totalWinAtomicUnits: 0,
	finalWinAtomicUnits: 0,
	totalFreeSpins: 0,
	freeSpin: 0,
	remainingFreeSpins: 0,
	clusterPositionKeys: [] as string[],
	removedPositionKeys: [] as string[],
	pastaPullPositionKeys: [] as string[],
	wokTossPositionKeys: [] as string[],
	sauceSpots: [] as SauceSpot[],
	handledEventIds: [] as string[],
	crownReveal: null as null | {
		chef: ChefId;
		multiplier: number;
		bonusWinAtomicUnits: number;
		finalBonusWinAtomicUnits: number;
	},
});

export const stateGame = $state(createInitialState());

export function resetGameState(): void {
	Object.assign(stateGame, createInitialState());
}
