import VS01 from './books/VS-01.json';
import VS02 from './books/VS-02.json';
import VS03 from './books/VS-03.json';
import VS04 from './books/VS-04.json';
import VS05 from './books/VS-05.json';
import { playBookEvents } from './bookEventHandlerMap';
import type { BookEvent, ChefId, Position, SymbolId, VerticalSliceId } from './typesBookEvent';

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

const chefIds = new Set<ChefId>(['italian', 'french', 'chinese']);
const symbolIds = new Set<SymbolId>([
	'pizza',
	'pasta_carbonara',
	'tiramisu',
	'frog_legs',
	'french_onion_soup',
	'croissant',
	'peking_duck',
	'kung_pao_chicken',
	'xiaolongbao',
	'golden_cloche_wild',
	'kitchen_crown_scatter',
	'pasta_wild',
]);
const chineseDishIds = new Set<SymbolId>(['peking_duck', 'kung_pao_chicken', 'xiaolongbao']);

const isRecord = (value: unknown): value is EventRecord =>
	typeof value === 'object' && value !== null;
const isNonNegativeSafeInteger = (value: unknown): value is number =>
	typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const isChefId = (value: unknown): value is ChefId =>
	typeof value === 'string' && chefIds.has(value as ChefId);
const isSymbolId = (value: unknown): value is SymbolId =>
	typeof value === 'string' && symbolIds.has(value as SymbolId);
const isPosition = (value: unknown): value is Position =>
	isRecord(value) &&
	isNonNegativeSafeInteger(value.reel) &&
	value.reel <= 4 &&
	isNonNegativeSafeInteger(value.row) &&
	value.row <= 4;
const isPositions = (value: unknown): value is Position[] =>
	Array.isArray(value) &&
	value.length > 0 &&
	value.every(isPosition) &&
	new Set(value.map((position) => `${position.reel}:${position.row}`)).size === value.length;
const isOrthogonallyAdjacent = (first: Position, second: Position) =>
	Math.abs(first.reel - second.reel) + Math.abs(first.row - second.row) === 1;
const isPastaPullPositions = (value: unknown) =>
	isPositions(value) && value.length === 2 && isOrthogonallyAdjacent(value[0], value[1]);
const isWokTossPositions = (value: unknown) =>
	isPositions(value) && value.length >= 4 && value.length <= 8;
const isBoard = (value: unknown) =>
	Array.isArray(value) &&
	value.length === 5 &&
	value.every((reel) => Array.isArray(reel) && reel.length === 5 && reel.every(isSymbolId));
const isMeterValue = (value: unknown) => isNonNegativeSafeInteger(value) && value <= 100;
const isMeterValues = (value: unknown) =>
	isRecord(value) && Array.from(chefIds).every((chef) => isMeterValue(value[chef]));
const isSauceSpots = (value: unknown) =>
	Array.isArray(value) &&
	value.length >= 3 &&
	value.length <= 5 &&
	value.every(
		(spot) =>
			isRecord(spot) &&
			isPosition(spot.position) &&
			isNonNegativeSafeInteger(spot.multiplier) &&
			spot.multiplier >= 2 &&
			spot.multiplier <= 10,
	) &&
	new Set(
		value.map((spot) => {
			if (!isRecord(spot) || !isPosition(spot.position)) return '';
			return `${spot.position.reel}:${spot.position.row}`;
		}),
	).size === value.length;
const isChineseDish = (value: unknown): value is SymbolId =>
	isSymbolId(value) && chineseDishIds.has(value);
const hasFields = (event: EventRecord, fields: readonly string[]) =>
	fields.every((field) => field in event);

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
	if (
		!hasFields(value, ['id', 'roundId']) ||
		typeof value.id !== 'string' ||
		typeof value.roundId !== 'string'
	) {
		return invalidEvent(value.type, 'id and roundId are required');
	}

	switch (value.type) {
		case 'roundStart':
			if (!hasFields(value, ['betAtomicUnits']) || !isNonNegativeSafeInteger(value.betAtomicUnits))
				return invalidEvent(value.type, 'betAtomicUnits');
			break;
		case 'revealBoard':
			if (!hasFields(value, ['board']) || !isBoard(value.board))
				return invalidEvent(value.type, 'board');
			break;
		case 'clusterWin':
			if (
				!hasFields(value, ['chef', 'symbol', 'positions', 'payoutAtomicUnits']) ||
				!isChefId(value.chef) ||
				!isSymbolId(value.symbol) ||
				!isPositions(value.positions) ||
				!isNonNegativeSafeInteger(value.payoutAtomicUnits)
			)
				return invalidEvent(value.type, 'chef, symbol, positions, and payoutAtomicUnits');
			break;
		case 'removeSymbols':
			if (!hasFields(value, ['positions']) || !isPositions(value.positions))
				return invalidEvent(value.type, 'positions');
			break;
		case 'cascade':
			if (!hasFields(value, ['index']) || !isNonNegativeSafeInteger(value.index))
				return invalidEvent(value.type, 'index');
			break;
		case 'chefMeterUpdate':
			if (
				!hasFields(value, ['chef', 'amount', 'total']) ||
				!isChefId(value.chef) ||
				!isMeterValue(value.amount) ||
				!isMeterValue(value.total)
			)
				return invalidEvent(value.type, 'chef, amount, and total');
			break;
		case 'pastaPull':
			if (
				!hasFields(value, ['chef', 'positions', 'meterAfter']) ||
				value.chef !== 'italian' ||
				!isPastaPullPositions(value.positions) ||
				value.meterAfter !== 0
			)
				return invalidEvent(value.type, 'chef, positions, and meterAfter');
			break;
		case 'sauceFinish':
			if (
				!hasFields(value, ['chef', 'spots', 'meterAfter']) ||
				value.chef !== 'french' ||
				!isSauceSpots(value.spots) ||
				value.meterAfter !== 0
			)
				return invalidEvent(value.type, 'chef, spots, and meterAfter');
			break;
		case 'wokToss':
			if (
				!hasFields(value, ['chef', 'positions', 'targetSymbol', 'meterAfter']) ||
				value.chef !== 'chinese' ||
				!isWokTossPositions(value.positions) ||
				!isChineseDish(value.targetSymbol) ||
				value.meterAfter !== 0
			)
				return invalidEvent(value.type, 'chef, positions, targetSymbol, and meterAfter');
			break;
		case 'kitchenShowdownStart':
			if (
				!hasFields(value, ['totalFreeSpins', 'meters']) ||
				!isNonNegativeSafeInteger(value.totalFreeSpins) ||
				!isMeterValues(value.meters)
			)
				return invalidEvent(value.type, 'totalFreeSpins and meters');
			break;
		case 'freeSpinStart':
			if (
				!hasFields(value, ['spin', 'remainingFreeSpins']) ||
				!isNonNegativeSafeInteger(value.spin) ||
				!isNonNegativeSafeInteger(value.remainingFreeSpins)
			)
				return invalidEvent(value.type, 'spin and remainingFreeSpins');
			break;
		case 'judgeStarUpdate':
			if (
				!hasFields(value, ['chef', 'stars']) ||
				!isChefId(value.chef) ||
				!isNonNegativeSafeInteger(value.stars) ||
				value.stars > 3
			)
				return invalidEvent(value.type, 'chef and stars');
			break;
		case 'kitchenCrownReveal':
			if (
				!hasFields(value, [
					'chef',
					'multiplier',
					'bonusWinAtomicUnits',
					'finalBonusWinAtomicUnits',
				]) ||
				!isChefId(value.chef) ||
				!isNonNegativeSafeInteger(value.multiplier) ||
				value.multiplier < 2 ||
				value.multiplier > 100 ||
				!isNonNegativeSafeInteger(value.bonusWinAtomicUnits) ||
				!isNonNegativeSafeInteger(value.finalBonusWinAtomicUnits)
			)
				return invalidEvent(
					value.type,
					'chef, multiplier, bonusWinAtomicUnits, and finalBonusWinAtomicUnits',
				);
			break;
		case 'setTotalWin':
			if (
				!hasFields(value, ['totalWinAtomicUnits']) ||
				!isNonNegativeSafeInteger(value.totalWinAtomicUnits)
			)
				return invalidEvent(value.type, 'totalWinAtomicUnits');
			break;
		case 'finalWin':
			if (
				!hasFields(value, ['payoutAtomicUnits']) ||
				!isNonNegativeSafeInteger(value.payoutAtomicUnits)
			)
				return invalidEvent(value.type, 'payoutAtomicUnits');
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
