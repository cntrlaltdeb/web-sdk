import VS01 from './books/VS-01.json';
import VS02 from './books/VS-02.json';
import VS03 from './books/VS-03.json';
import VS04 from './books/VS-04.json';
import VS05 from './books/VS-05.json';
import { playBookEvents } from './bookEventHandlerMap';
import type { BookEvent, VerticalSliceId } from './typesBookEvent';

const staticBooks: Record<VerticalSliceId, unknown> = {
	'VS-01': VS01,
	'VS-02': VS02,
	'VS-03': VS03,
	'VS-04': VS04,
	'VS-05': VS05,
};

const knownEventTypes = new Set<BookEvent['type']>([
	'roundStart',
	'revealBoard',
	'clusterWin',
	'removeSymbols',
	'cascade',
	'chefMeterUpdate',
	'pastaPull',
	'sauceFinish',
	'wokToss',
	'kitchenShowdownStart',
	'freeSpinStart',
	'judgeStarUpdate',
	'kitchenCrownReveal',
	'setTotalWin',
	'finalWin',
]);

type EventRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is EventRecord => typeof value === 'object' && value !== null;
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isPosition = (value: unknown) =>
	isRecord(value) && isNumber(value.reel) && isNumber(value.row);
const isPositions = (value: unknown) => Array.isArray(value) && value.every(isPosition);
const isBoard = (value: unknown) =>
	Array.isArray(value) &&
	value.length === 5 &&
	value.every((reel) => Array.isArray(reel) && reel.length === 5 && reel.every((symbol) => typeof symbol === 'string'));
const hasFields = (event: EventRecord, fields: readonly string[]) => fields.every((field) => field in event);

function invalidEvent(type: string, field: string): never {
	throw new Error(`Invalid ${type} BookEvent: ${field}`);
}

function validateStaticEvent(value: unknown): BookEvent {
	if (!isRecord(value) || typeof value.type !== 'string') {
		throw new Error('Local book contains an invalid BookEvent');
	}
	if (!knownEventTypes.has(value.type as BookEvent['type'])) {
		throw new Error(`Unknown BookEvent type: ${value.type}`);
	}
	if (!hasFields(value, ['id', 'roundId']) || typeof value.id !== 'string' || typeof value.roundId !== 'string') {
		return invalidEvent(value.type, 'id and roundId are required');
	}

	switch (value.type) {
		case 'roundStart':
			if (!isNumber(value.betAtomicUnits)) return invalidEvent(value.type, 'betAtomicUnits');
			break;
		case 'revealBoard':
			if (!isBoard(value.board)) return invalidEvent(value.type, 'board');
			break;
		case 'clusterWin':
			if (
				typeof value.chef !== 'string' ||
				typeof value.symbol !== 'string' ||
				!isPositions(value.positions) ||
				!isNumber(value.payoutAtomicUnits)
			)
				return invalidEvent(value.type, 'chef, symbol, positions, and payoutAtomicUnits');
			break;
		case 'removeSymbols':
			if (!isPositions(value.positions)) return invalidEvent(value.type, 'positions');
			break;
		case 'cascade':
			if (!isNumber(value.index)) return invalidEvent(value.type, 'index');
			break;
		case 'chefMeterUpdate':
			if (
				typeof value.chef !== 'string' ||
				!isNumber(value.amount) ||
				!isNumber(value.total)
			)
				return invalidEvent(value.type, 'chef, amount, and total');
			break;
		case 'pastaPull':
			if (value.chef !== 'italian' || !isPositions(value.positions) || value.meterAfter !== 0)
				return invalidEvent(value.type, 'chef, positions, and meterAfter');
			break;
		case 'sauceFinish':
			if (
				value.chef !== 'french' ||
				!Array.isArray(value.spots) ||
				!value.spots.every((spot) => isRecord(spot) && isPosition(spot.position) && isNumber(spot.multiplier)) ||
				value.meterAfter !== 0
			)
				return invalidEvent(value.type, 'chef, spots, and meterAfter');
			break;
		case 'wokToss':
			if (
				value.chef !== 'chinese' ||
				!isPositions(value.positions) ||
				typeof value.targetSymbol !== 'string' ||
				value.meterAfter !== 0
			)
				return invalidEvent(value.type, 'chef, positions, targetSymbol, and meterAfter');
			break;
		case 'kitchenShowdownStart':
			if (!isNumber(value.totalFreeSpins) || !isRecord(value.meters))
				return invalidEvent(value.type, 'totalFreeSpins and meters');
			break;
		case 'freeSpinStart':
			if (!isNumber(value.spin) || !isNumber(value.remainingFreeSpins))
				return invalidEvent(value.type, 'spin and remainingFreeSpins');
			break;
		case 'judgeStarUpdate':
			if (typeof value.chef !== 'string' || !isNumber(value.stars)) return invalidEvent(value.type, 'chef and stars');
			break;
		case 'kitchenCrownReveal':
			if (
				typeof value.chef !== 'string' ||
				!isNumber(value.multiplier) ||
				!isNumber(value.bonusWinAtomicUnits) ||
				!isNumber(value.finalBonusWinAtomicUnits)
			)
				return invalidEvent(value.type, 'chef, multiplier, and payout fields');
			break;
		case 'setTotalWin':
			if (!isNumber(value.totalWinAtomicUnits)) return invalidEvent(value.type, 'totalWinAtomicUnits');
			break;
		case 'finalWin':
			if (!isNumber(value.payoutAtomicUnits)) return invalidEvent(value.type, 'payoutAtomicUnits');
			break;
	}

	return value as BookEvent;
}

function parseStaticBook(book: unknown): BookEvent[] {
	if (!Array.isArray(book)) throw new Error('Local book must be an event array');
	return book.map(validateStaticEvent);
}

export async function loadLocalBook(roundId: VerticalSliceId): Promise<BookEvent[]> {
	return parseStaticBook(staticBooks[roundId]);
}

export async function playLocalBook(roundId: VerticalSliceId): Promise<void> {
	await playBookEvents(await loadLocalBook(roundId));
}
