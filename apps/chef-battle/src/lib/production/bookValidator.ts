import type {
	Board,
	ChefId,
	GameMode,
	MeterValues,
	ProductionBookEvent,
	ValidatedProductionBook,
} from './typesBookEvent';

const MAX_SAFE_INTEGER = 9_007_199_254_740_991;
const MAX_WIN_MULTIPLIER = 20_000;
const modeCosts: Readonly<Record<GameMode, number>> = {
	base: 1,
	extraReservation: 2,
	signatureSpin: 50,
	kitchenShowdown: 100,
	grandShowdown: 250,
	mysteryTasting: 250,
};
const modes = new Set<GameMode>(Object.keys(modeCosts) as GameMode[]);
const chefIds = new Set<ChefId>(['italian', 'french', 'chinese']);
const p300EventTypes = ['roundStart', 'revealBoard', 'setTotalWin', 'finalWin'] as const;
const symbolIds = new Set([
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

type EventRecord = Record<string, unknown>;

const validatedBooks = new WeakSet<ValidatedProductionBook>();

const isRecord = (value: unknown): value is EventRecord => typeof value === 'object' && value !== null;
const isSafeNonNegativeInteger = (value: unknown): value is number =>
	typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= MAX_SAFE_INTEGER;

function validationError(message: string): never {
	throw new Error(`Invalid production Book: ${message}`);
}

function requireSafeNonNegativeInteger(value: unknown, field: string): number {
	if (!isSafeNonNegativeInteger(value)) validationError(`${field} must be a safe non-negative integer`);
	return value;
}

function isMeterValues(value: unknown): value is MeterValues {
	return (
		isRecord(value) &&
		Object.keys(value).length === chefIds.size &&
		Array.from(chefIds).every((chef) => isSafeNonNegativeInteger(value[chef]) && value[chef] <= 100)
	);
}

function isBoard(value: unknown): value is Board {
	return (
		Array.isArray(value) &&
		value.length === 5 &&
		value.every(
			(reel) =>
				Array.isArray(reel) &&
				reel.length === 5 &&
				reel.every((symbol) => typeof symbol === 'string' && symbolIds.has(symbol)),
		)
	);
}

function validateRoundStart(event: EventRecord): void {
	const mode = event.mode;
	if (typeof mode !== 'string' || !modes.has(mode as GameMode)) validationError('roundStart.mode');
	const bet = requireSafeNonNegativeInteger(event.betAtomicUnits, 'roundStart.betAtomicUnits');
	const paidBet = requireSafeNonNegativeInteger(event.paidBetAtomicUnits, 'roundStart.paidBetAtomicUnits');
	const maxWin = requireSafeNonNegativeInteger(event.maxWinAtomicUnits, 'roundStart.maxWinAtomicUnits');
	if (!isMeterValues(event.meters)) validationError('roundStart.meters');
	if (paidBet !== bet * modeCosts[mode as GameMode]) validationError('roundStart.paidBetAtomicUnits');
	if (maxWin !== bet * MAX_WIN_MULTIPLIER) validationError('roundStart.maxWinAtomicUnits');
}

function validateKnownPayload(event: EventRecord): void {
	switch (event.type) {
		case 'roundStart':
			validateRoundStart(event);
			return;
		case 'revealBoard':
			if (!isBoard(event.board)) validationError('revealBoard.board');
			return;
		case 'setTotalWin':
			requireSafeNonNegativeInteger(event.totalWinAtomicUnits, 'setTotalWin.totalWinAtomicUnits');
			return;
		case 'finalWin':
			requireSafeNonNegativeInteger(event.payoutAtomicUnits, 'finalWin.payoutAtomicUnits');
			return;
		default:
			validationError(`unknown event type ${String(event.type)}`);
	}
}

function freezeDeep<T>(value: T): T {
	if (Array.isArray(value)) value.forEach(freezeDeep);
	else if (isRecord(value)) Object.values(value).forEach(freezeDeep);
	return Object.freeze(value);
}

export function validateProductionBook(value: unknown): ValidatedProductionBook {
	if (!Array.isArray(value) || value.length === 0) validationError('event array is required');
	const events = value.map((event, index) => {
		if (!isRecord(event)) validationError(`events[${index}] must be an object`);
		return event;
	});
	const ids = new Set<string>();
	const roundIds = new Set<string>();

	events.forEach((event, index) => {
		const sequence = requireSafeNonNegativeInteger(event.sequence, 'event.sequence');
		if (sequence !== index + 1) validationError('sequence must be gapless and one-based');
		if (typeof event.id !== 'string' || typeof event.roundId !== 'string' || event.roundId.length === 0)
			validationError('id and roundId are required');
		if (ids.has(event.id)) validationError('duplicate event id');
		ids.add(event.id);
		roundIds.add(event.roundId);
		if (event.id !== `${event.roundId}-e${String(sequence).padStart(4, '0')}`)
			validationError('id must match roundId and sequence suffix');
		if (typeof event.type !== 'string') validationError('event type is required');
	});

	if (roundIds.size !== 1) validationError('one roundId is required');
	if (
		events.length !== p300EventTypes.length ||
		events.some((event, index) => event.type !== p300EventTypes[index])
	)
		validationError('P3-00 must contain exactly roundStart → revealBoard → setTotalWin → finalWin');
	events.forEach(validateKnownPayload);
	const totalWin = events[2];
	const finalWin = events[3];
	if (!totalWin || !finalWin) validationError('P3-00 terminal events are required');
	const totalWinAtomicUnits = requireSafeNonNegativeInteger(
		totalWin.totalWinAtomicUnits,
		'setTotalWin.totalWinAtomicUnits',
	);
	const finalWinAtomicUnits = requireSafeNonNegativeInteger(
		finalWin.payoutAtomicUnits,
		'finalWin.payoutAtomicUnits',
	);
	const roundStart = events[0];
	if (!roundStart) validationError('P3-00 roundStart is required');
	const maxWinAtomicUnits = requireSafeNonNegativeInteger(
		roundStart.maxWinAtomicUnits,
		'roundStart.maxWinAtomicUnits',
	);
	if (totalWinAtomicUnits !== finalWinAtomicUnits) validationError('setTotalWin must equal finalWin');
	if (finalWinAtomicUnits > maxWinAtomicUnits) validationError('finalWin exceeds maxWinAtomicUnits');

	const validatedBook = freezeDeep({
		events: events as ProductionBookEvent[],
		finalWinAtomicUnits,
	});
	validatedBooks.add(validatedBook);
	return validatedBook;
}

export function assertValidatedProductionBook(book: ValidatedProductionBook): void {
	if (!validatedBooks.has(book)) validationError('Book must be returned by validateProductionBook');
}
