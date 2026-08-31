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

const isRecord = (value: unknown): value is EventRecord =>
	typeof value === 'object' && value !== null;
const isSafeNonNegativeInteger = (value: unknown): value is number =>
	typeof value === 'number' &&
	Number.isSafeInteger(value) &&
	value >= 0 &&
	value <= MAX_SAFE_INTEGER;

function validationError(message: string): never {
	throw new Error(`Invalid production Book: ${message}`);
}

function requireSafeNonNegativeInteger(value: unknown, field: string): number {
	if (!isSafeNonNegativeInteger(value))
		validationError(`${field} must be a safe non-negative integer`);
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

function requirePositions(value: unknown, field: string): Array<{ reel: number; row: number }> {
	if (!Array.isArray(value) || value.length === 0)
		validationError(`${field} must be a non-empty position array`);
	const positions = value.map((position, index) => {
		if (!isRecord(position)) validationError(`${field}[${index}] must be an object`);
		const reel = position.reel;
		const row = position.row;
		if (
			typeof reel !== 'number' ||
			typeof row !== 'number' ||
			!Number.isInteger(reel) ||
			!Number.isInteger(row) ||
			reel < 0 ||
			reel > 4 ||
			row < 0 ||
			row > 4
		)
			validationError(`${field}[${index}] must be a board position`);
		return { reel, row };
	});
	if (
		new Set(positions.map((position) => `${position.reel}:${position.row}`)).size !==
		positions.length
	)
		validationError(`${field} must not contain duplicate positions`);
	return positions;
}

function samePositions(
	left: readonly { reel: number; row: number }[],
	right: readonly { reel: number; row: number }[],
): boolean {
	return (
		left.length === right.length &&
		left.every((position, index) => {
			const other = right[index];
			return other?.reel === position.reel && other.row === position.row;
		})
	);
}

function validateRoundStart(event: EventRecord): void {
	const mode = event.mode;
	if (typeof mode !== 'string' || !modes.has(mode as GameMode)) validationError('roundStart.mode');
	const bet = requireSafeNonNegativeInteger(event.betAtomicUnits, 'roundStart.betAtomicUnits');
	const paidBet = requireSafeNonNegativeInteger(
		event.paidBetAtomicUnits,
		'roundStart.paidBetAtomicUnits',
	);
	const maxWin = requireSafeNonNegativeInteger(
		event.maxWinAtomicUnits,
		'roundStart.maxWinAtomicUnits',
	);
	if (!isMeterValues(event.meters)) validationError('roundStart.meters');
	if (paidBet !== bet * modeCosts[mode as GameMode])
		validationError('roundStart.paidBetAtomicUnits');
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
		case 'clusterWin': {
			if (typeof event.chef !== 'string' || !chefIds.has(event.chef as ChefId))
				validationError('clusterWin.chef');
			if (typeof event.symbol !== 'string' || !symbolIds.has(event.symbol))
				validationError('clusterWin.symbol');
			requirePositions(event.positions, 'clusterWin.positions');
			requireSafeNonNegativeInteger(
				event.basePayoutAtomicUnits,
				'clusterWin.basePayoutAtomicUnits',
			);
			if (!Array.isArray(event.appliedSauceSpots) || event.appliedSauceSpots.length !== 0)
				validationError('clusterWin.appliedSauceSpots');
			if (event.sauceFlightMultiplier !== 1) validationError('clusterWin.sauceFlightMultiplier');
			if (event.payoutAtomicUnits !== event.basePayoutAtomicUnits)
				validationError('clusterWin.payoutAtomicUnits');
			requireSafeNonNegativeInteger(event.payoutAtomicUnits, 'clusterWin.payoutAtomicUnits');
			return;
		}
		case 'roundWinUpdate':
			if (typeof event.sourceEventId !== 'string' || event.sourceEventId.length === 0)
				validationError('roundWinUpdate.sourceEventId');
			requireSafeNonNegativeInteger(event.creditAtomicUnits, 'roundWinUpdate.creditAtomicUnits');
			requireSafeNonNegativeInteger(
				event.balanceAfterAtomicUnits,
				'roundWinUpdate.balanceAfterAtomicUnits',
			);
			return;
		case 'chefMeterUpdate':
			if (typeof event.chef !== 'string' || !chefIds.has(event.chef as ChefId))
				validationError('chefMeterUpdate.chef');
			requireSafeNonNegativeInteger(event.earnedCharge, 'chefMeterUpdate.earnedCharge');
			requireSafeNonNegativeInteger(event.appliedCharge, 'chefMeterUpdate.appliedCharge');
			requireSafeNonNegativeInteger(event.overflowCharge, 'chefMeterUpdate.overflowCharge');
			if (!isSafeNonNegativeInteger(event.meterAfter) || event.meterAfter > 100)
				validationError('chefMeterUpdate.meterAfter');
			if (event.serviceQueueEntryId !== null || event.perfectServeUnitsAfter !== 0)
				validationError('chefMeterUpdate service queue fields');
			return;
		case 'removeSymbols':
			requirePositions(event.positions, 'removeSymbols.positions');
			return;
		case 'cascade':
			if (event.index !== 1) validationError('cascade.index');
			return;
		case 'boardSettled':
			if (!isBoard(event.board)) validationError('boardSettled.board');
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

function validateBaseLifecycle(events: EventRecord[]): number {
	const roundStart = events[0];
	const revealBoard = events[1];
	if (
		!roundStart ||
		!revealBoard ||
		roundStart.type !== 'roundStart' ||
		revealBoard.type !== 'revealBoard'
	)
		validationError('Base round must start roundStart → revealBoard');
	validateRoundStart(roundStart);
	if (roundStart.mode !== 'base') validationError('Task 2 supports Base production rounds only');
	if (
		!isMeterValues(roundStart.meters) ||
		Object.values(roundStart.meters).some((meter) => meter !== 0)
	)
		validationError('Base roundStart.meters must reset to zero');
	if (!isBoard(revealBoard.board)) validationError('revealBoard.board');

	const meters: Record<ChefId, number> = { ...roundStart.meters };
	const creditedSources = new Set<string>();
	let balance = 0;
	let index = 2;
	let clusterCount = 0;
	while (events[index]?.type === 'clusterWin') {
		const cluster = events[index];
		if (!cluster) validationError('clusterWin is required');
		validateKnownPayload(cluster);
		const chef = cluster.chef as ChefId;
		const payout = requireSafeNonNegativeInteger(
			cluster.payoutAtomicUnits,
			'clusterWin.payoutAtomicUnits',
		);
		const ledger = events[index + 1];
		if (!ledger || ledger.type !== 'roundWinUpdate')
			validationError('clusterWin requires immediate roundWinUpdate');
		validateKnownPayload(ledger);
		if (ledger.sourceEventId !== cluster.id || creditedSources.has(ledger.sourceEventId as string))
			validationError('roundWinUpdate.sourceEventId must credit one unique cluster source');
		const credit = requireSafeNonNegativeInteger(
			ledger.creditAtomicUnits,
			'roundWinUpdate.creditAtomicUnits',
		);
		const balanceAfter = requireSafeNonNegativeInteger(
			ledger.balanceAfterAtomicUnits,
			'roundWinUpdate.balanceAfterAtomicUnits',
		);
		if (credit !== payout || balanceAfter !== balance + credit)
			validationError('roundWinUpdate.balanceAfterAtomicUnits must exactly credit the source');
		creditedSources.add(ledger.sourceEventId as string);
		balance = balanceAfter;
		const meter = events[index + 2];
		if (!meter || meter.type !== 'chefMeterUpdate')
			validationError('roundWinUpdate requires chefMeterUpdate');
		validateKnownPayload(meter);
		if (meter.chef !== chef) validationError('chefMeterUpdate.chef');
		const earned = requireSafeNonNegativeInteger(
			meter.earnedCharge,
			'chefMeterUpdate.earnedCharge',
		);
		const applied = requireSafeNonNegativeInteger(
			meter.appliedCharge,
			'chefMeterUpdate.appliedCharge',
		);
		const overflow = requireSafeNonNegativeInteger(
			meter.overflowCharge,
			'chefMeterUpdate.overflowCharge',
		);
		const meterAfter = requireSafeNonNegativeInteger(
			meter.meterAfter,
			'chefMeterUpdate.meterAfter',
		);
		if (earned !== applied + overflow || meterAfter !== meters[chef] + applied || meterAfter > 100)
			validationError('chefMeterUpdate charge fields');
		meters[chef] = meterAfter;
		const removal = events[index + 3];
		if (!removal || removal.type !== 'removeSymbols')
			validationError('chefMeterUpdate requires removeSymbols');
		if (
			!samePositions(
				requirePositions(removal.positions, 'removeSymbols.positions'),
				requirePositions(cluster.positions, 'clusterWin.positions'),
			)
		)
			validationError('removeSymbols.positions must match clusterWin.positions');
		index += 4;
		clusterCount++;
	}
	if (clusterCount > 0) {
		const cascade = events[index];
		const settled = events[index + 1];
		if (!cascade || cascade.type !== 'cascade') validationError('Base clusters require cascade');
		if (!settled || settled.type !== 'boardSettled')
			validationError('cascade requires boardSettled');
		validateKnownPayload(cascade);
		validateKnownPayload(settled);
		index += 2;
	}
	const total = events[index];
	const final = events[index + 1];
	if (
		!total ||
		!final ||
		index + 2 !== events.length ||
		total.type !== 'setTotalWin' ||
		final.type !== 'finalWin'
	)
		validationError('Base round must end setTotalWin → finalWin');
	validateKnownPayload(total);
	validateKnownPayload(final);
	const totalWin = requireSafeNonNegativeInteger(
		total.totalWinAtomicUnits,
		'setTotalWin.totalWinAtomicUnits',
	);
	const finalWin = requireSafeNonNegativeInteger(
		final.payoutAtomicUnits,
		'finalWin.payoutAtomicUnits',
	);
	if (totalWin !== balance || finalWin !== balance)
		validationError('terminal payout must match ledger balance');
	return finalWin;
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
		if (
			typeof event.id !== 'string' ||
			typeof event.roundId !== 'string' ||
			event.roundId.length === 0
		)
			validationError('id and roundId are required');
		if (ids.has(event.id)) validationError('duplicate event id');
		ids.add(event.id);
		roundIds.add(event.roundId);
		if (event.id !== `${event.roundId}-e${String(sequence).padStart(4, '0')}`)
			validationError('id must match roundId and sequence suffix');
		if (typeof event.type !== 'string') validationError('event type is required');
	});

	if (roundIds.size !== 1) validationError('one roundId is required');
	const roundStart = events[0];
	if (!roundStart || roundStart.type !== 'roundStart') validationError('roundStart is required');
	if (
		roundStart.roundId === 'P3-00' &&
		(events.length !== p300EventTypes.length ||
			events.some((event, index) => event.type !== p300EventTypes[index]))
	)
		validationError('P3-00 must contain exactly roundStart → revealBoard → setTotalWin → finalWin');
	const finalWinAtomicUnits = validateBaseLifecycle(events);
	const maxWinAtomicUnits = requireSafeNonNegativeInteger(
		roundStart.maxWinAtomicUnits,
		'roundStart.maxWinAtomicUnits',
	);
	if (finalWinAtomicUnits > maxWinAtomicUnits)
		validationError('finalWin exceeds maxWinAtomicUnits');

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
