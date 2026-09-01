import { resetGameState, stateGame } from '../game/stateGame.svelte';
import type { BookEvent, BookEventOfType, Position } from './typesBookEvent';

type BookEventHandlerMap = {
	[TType in BookEvent['type']]: (event: BookEventOfType<TType>) => void | Promise<void>;
};

const positionKey = ({ reel, row }: Position) => `${reel}:${row}`;

export const bookEventHandlerMap = {
	roundStart: (event) => {
		resetGameState();
		stateGame.roundId = event.roundId;
		stateGame.betAtomicUnits = event.betAtomicUnits;
		stateGame.meters = { ...event.meters };
	},
	revealBoard: (event) => {
		stateGame.board.splice(
			0,
			stateGame.board.length,
			...event.board.flatMap((reel, reelIndex) =>
				reel.map((symbol, row) => ({
					position: { reel: reelIndex, row },
					symbol,
					isWild: symbol === 'golden_cloche_wild' || symbol === 'pasta_wild',
					isScatter: symbol === 'kitchen_crown_scatter',
				})),
			),
		);
		stateGame.boardVersion += 1;
		stateGame.clusterPositionKeys = [];
		stateGame.clusterWinAtomicUnits = 0;
		stateGame.removedPositionKeys = [];
		stateGame.pastaPullPositionKeys = [];
		stateGame.wokTossPositionKeys = [];
	},
	clusterWin: (event) => {
		stateGame.clusterPositionKeys = event.positions.map(positionKey);
		stateGame.clusterWinAtomicUnits = event.payoutAtomicUnits;
	},
	removeSymbols: (event) => {
		stateGame.removedPositionKeys = event.positions.map(positionKey);
	},
	cascade: (event) => {
		stateGame.cascadeIndex = event.index;
	},
	chefMeterUpdate: (event) => {
		stateGame.meters[event.chef] = event.total;
		stateGame.lastMeterAmount = event.amount;
	},
	pastaPull: (event) => {
		stateGame.meters[event.chef] = event.meterAfter;
		stateGame.pastaPullPositionKeys = event.positions.map(positionKey);
	},
	sauceFinish: (event) => {
		stateGame.meters[event.chef] = event.meterAfter;
		stateGame.sauceSpots = event.spots.map((spot) => ({
			position: { ...spot.position },
			multiplier: spot.multiplier,
		}));
	},
	wokToss: (event) => {
		stateGame.meters[event.chef] = event.meterAfter;
		stateGame.wokTossPositionKeys = event.positions.map(positionKey);
	},
	kitchenShowdownStart: (event) => {
		stateGame.totalFreeSpins = event.totalFreeSpins;
		stateGame.meters = { ...event.meters };
		stateGame.judgeStars = { italian: 0, french: 0, chinese: 0 };
		stateGame.crownReveal = null;
	},
	freeSpinStart: (event) => {
		stateGame.freeSpin = event.spin;
		stateGame.remainingFreeSpins = event.remainingFreeSpins;
	},
	judgeStarUpdate: (event) => {
		stateGame.judgeStars[event.chef] = event.stars;
	},
	kitchenCrownReveal: (event) => {
		stateGame.crownReveal = {
			chef: event.chef,
			multiplier: event.multiplier,
			bonusWinAtomicUnits: event.bonusWinAtomicUnits,
			finalBonusWinAtomicUnits: event.finalBonusWinAtomicUnits,
		};
	},
	setTotalWin: (event) => {
		stateGame.totalWinAtomicUnits = event.totalWinAtomicUnits;
	},
	finalWin: (event) => {
		stateGame.finalWinAtomicUnits = event.payoutAtomicUnits;
	},
} satisfies BookEventHandlerMap;

export async function playBookEvent(event: BookEvent): Promise<void> {
	const handler = (
		bookEventHandlerMap as Record<
			string,
			((bookEvent: BookEvent) => void | Promise<void>) | undefined
		>
	)[event.type];
	if (!handler) throw new Error(`Unknown BookEvent type: ${event.type}`);
	await handler(event);
	stateGame.handledEventIds.push(event.id);
}

export async function playBookEvents(events: readonly BookEvent[]): Promise<void> {
	for (const event of events) await playBookEvent(event);
}
