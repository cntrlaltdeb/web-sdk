import { productionState } from './stateGame.svelte';
import type { ProductionBookEvent } from './typesBookEvent';

type ProductionBookEventHandlerMap = {
	[TType in ProductionBookEvent['type']]: (
		event: Extract<ProductionBookEvent, { type: TType }>,
	) => void | Promise<void>;
};

export const productionBookEventHandlerMap = {
	roundStart: (event) => {
		productionState.roundId = event.roundId;
		productionState.mode = event.mode;
		productionState.betAtomicUnits = event.betAtomicUnits;
		productionState.paidBetAtomicUnits = event.paidBetAtomicUnits;
		productionState.maxWinAtomicUnits = event.maxWinAtomicUnits;
		productionState.meters = { ...event.meters };
	},
	revealBoard: (event) => {
		productionState.board = event.board.map((reel) => [...reel]);
	},
	clusterWin: () => {},
	roundWinUpdate: (event) => {
		productionState.roundWinAtomicUnits = event.balanceAfterAtomicUnits;
	},
	chefMeterUpdate: (event) => {
		productionState.meters = { ...productionState.meters, [event.chef]: event.meterAfter };
	},
	removeSymbols: () => {},
	cascade: (event) => {
		productionState.cascadeIndex = event.index;
	},
	boardSettled: (event) => {
		productionState.board = event.board.map((reel) => [...reel]);
	},
	setTotalWin: (event) => {
		productionState.totalWinAtomicUnits = event.totalWinAtomicUnits;
	},
	finalWin: (event) => {
		productionState.finalWinAtomicUnits = event.payoutAtomicUnits;
	},
} satisfies ProductionBookEventHandlerMap;

export async function playProductionBookEvent(event: ProductionBookEvent): Promise<void> {
	const handler = productionBookEventHandlerMap[event.type];
	await handler(event as never);
	productionState.handledSequences.push(event.sequence);
}
