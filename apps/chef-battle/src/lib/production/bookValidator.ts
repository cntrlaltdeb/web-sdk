import type {
	Board,
	ChefId,
	GameMode,
	MeterValues,
	ProductionBookEvent,
	ValidatedProductionBook,
} from './typesBookEvent';
import type { Position, SymbolId } from '../typesBookEvent';

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
const dishChefs: Readonly<
	Record<Exclude<SymbolId, 'golden_cloche_wild' | 'kitchen_crown_scatter' | 'pasta_wild'>, ChefId>
> = {
	pizza: 'italian',
	pasta_carbonara: 'italian',
	tiramisu: 'italian',
	frog_legs: 'french',
	french_onion_soup: 'french',
	croissant: 'french',
	peking_duck: 'chinese',
	kung_pao_chicken: 'chinese',
	xiaolongbao: 'chinese',
};
const wildSymbols = new Set<SymbolId>(['golden_cloche_wild', 'pasta_wild']);

type EventRecord = Record<string, unknown>;
export type CanonicalProductionCluster = Readonly<{
	chef: ChefId;
	symbol: SymbolId;
	positions: readonly Position[];
	hasGoldenClocheWild: boolean;
}>;

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

const positionKey = (position: Position): string => `${position.reel}:${position.row}`;

const comparePosition = (left: Position, right: Position): number =>
	left.reel - right.reel || left.row - right.row;

export function findCanonicalProductionClusters(
	board: Board,
): readonly CanonicalProductionCluster[] {
	const candidates: CanonicalProductionCluster[] = [];
	for (const [symbol, chef] of Object.entries(dishChefs) as Array<[SymbolId, ChefId]>) {
		const available = new Map<string, Position>();
		for (let reel = 0; reel < board.length; reel++) {
			const symbols = board[reel];
			if (!symbols) continue;
			for (let row = 0; row < symbols.length; row++) {
				const cell = symbols[row];
				if (cell === symbol || wildSymbols.has(cell))
					available.set(`${reel}:${row}`, { reel, row });
			}
		}
		const visited = new Set<string>();
		for (const start of [...available.values()].sort(comparePosition)) {
			const startKey = positionKey(start);
			if (visited.has(startKey)) continue;
			const component: Position[] = [];
			const pending = [start];
			visited.add(startKey);
			while (pending.length > 0) {
				const current = pending.pop();
				if (!current) continue;
				component.push(current);
				for (const neighbor of [
					{ reel: current.reel - 1, row: current.row },
					{ reel: current.reel + 1, row: current.row },
					{ reel: current.reel, row: current.row - 1 },
					{ reel: current.reel, row: current.row + 1 },
				]) {
					const key = positionKey(neighbor);
					if (available.has(key) && !visited.has(key)) {
						visited.add(key);
						pending.push(neighbor);
					}
				}
			}
			if (
				component.length < 4 ||
				!component.some((position) => board[position.reel]?.[position.row] === symbol)
			)
				continue;
			const positions = component.sort(comparePosition);
			candidates.push({
				chef,
				symbol,
				positions,
				hasGoldenClocheWild: positions.some(
					(position) => board[position.reel]?.[position.row] === 'golden_cloche_wild',
				),
			});
		}
	}
	const claimed = new Set<string>();
	return candidates
		.sort((left, right) => {
			if (left.positions.length !== right.positions.length)
				return right.positions.length - left.positions.length;
			if (left.symbol !== right.symbol) return left.symbol < right.symbol ? -1 : 1;
			const leftFirst = left.positions[0];
			const rightFirst = right.positions[0];
			return leftFirst && rightFirst ? comparePosition(leftFirst, rightFirst) : 0;
		})
		.filter((cluster) => {
			if (cluster.positions.some((position) => claimed.has(positionKey(position)))) return false;
			cluster.positions.forEach((position) => claimed.add(positionKey(position)));
			return true;
		});
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
			if (event.serviceQueueEntryId !== null && typeof event.serviceQueueEntryId !== 'string')
				validationError('chefMeterUpdate.serviceQueueEntryId');
			requireSafeNonNegativeInteger(
				event.perfectServeUnitsAfter,
				'chefMeterUpdate.perfectServeUnitsAfter',
			);
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
		case 'serviceQueueOpened':
			if (!Array.isArray(event.entries)) validationError('serviceQueueOpened.entries');
			return;
		case 'pastaPull':
			if (typeof event.queueEntryId !== 'string' || event.queueEntryId.length === 0)
				validationError('pastaPull.queueEntryId');
			requirePositions(event.positions, 'pastaPull.positions');
			if (!isBoard(event.boardAfter)) validationError('pastaPull.boardAfter');
			return;
		case 'perfectServeAward':
			if (typeof event.queueEntryId !== 'string' || event.queueEntryId.length === 0)
				validationError('perfectServeAward.queueEntryId');
			requireSafeNonNegativeInteger(
				event.consumedOverflowUnits,
				'perfectServeAward.consumedOverflowUnits',
			);
			requireSafeNonNegativeInteger(event.payoutAtomicUnits, 'perfectServeAward.payoutAtomicUnits');
			return;
		case 'serviceQueueClosed':
			if (typeof event.queueEntryId !== 'string' || event.queueEntryId.length === 0)
				validationError('serviceQueueClosed.queueEntryId');
			if (typeof event.chef !== 'string' || !chefIds.has(event.chef as ChefId))
				validationError('serviceQueueClosed.chef');
			if (!isBoard(event.board)) validationError('serviceQueueClosed.board');
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
	const remainingClusters = [...findCanonicalProductionClusters(revealBoard.board)];

	const meters: Record<ChefId, number> = { ...roundStart.meters };
	const readyEntries: Array<{ id: string; chef: ChefId; perfectServeUnits: number }> = [];
	const creditedSources = new Set<string>();
	let balance = 0;
	let index = 2;
	let clusterCount = 0;
	while (events[index]?.type === 'clusterWin') {
		const cluster = events[index];
		if (!cluster) validationError('clusterWin is required');
		validateKnownPayload(cluster);
		const expectedCluster = remainingClusters.shift();
		if (
			!expectedCluster ||
			cluster.chef !== expectedCluster.chef ||
			cluster.symbol !== expectedCluster.symbol ||
			!samePositions(
				requirePositions(cluster.positions, 'clusterWin.positions'),
				expectedCluster.positions,
			)
		)
			validationError('clusterWin must match the next canonical board cluster');
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
		const existingEntry = readyEntries.find((entry) => entry.chef === chef);
		if (meterAfter === 100) {
			const expectedId = existingEntry?.id ?? `${roundStart.roundId}-service-01-${chef}`;
			const expectedUnits = (existingEntry?.perfectServeUnits ?? 0) + overflow;
			if (
				meter.serviceQueueEntryId !== expectedId ||
				meter.perfectServeUnitsAfter !== expectedUnits
			)
				validationError('chefMeterUpdate service queue fields');
			if (existingEntry) existingEntry.perfectServeUnits = expectedUnits;
			else readyEntries.push({ id: expectedId, chef, perfectServeUnits: expectedUnits });
		} else if (meter.serviceQueueEntryId !== null || meter.perfectServeUnitsAfter !== 0) {
			validationError('chefMeterUpdate service queue fields');
		}
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
	if (remainingClusters.length > 0)
		validationError('all current board clusters require a ledger credit');
	let currentBoard: Board = revealBoard.board;
	if (clusterCount > 0) {
		const cascade = events[index];
		const settled = events[index + 1];
		if (!cascade || cascade.type !== 'cascade') validationError('Base clusters require cascade');
		if (!settled || settled.type !== 'boardSettled')
			validationError('cascade requires boardSettled');
		validateKnownPayload(cascade);
		validateKnownPayload(settled);
		if (!isBoard(settled.board)) validationError('boardSettled.board');
		if (findCanonicalProductionClusters(settled.board).length > 0)
			validationError('boardSettled leaves remaining clusters before terminal events');
		currentBoard = settled.board;
		index += 2;
	}
	if (readyEntries.length > 0) {
		const opened = events[index];
		if (!opened || opened.type !== 'serviceQueueOpened')
			validationError('READY chefs require serviceQueueOpened after boardSettled');
		validateKnownPayload(opened);
		if (
			!Array.isArray(opened.entries) ||
			opened.entries.length !== readyEntries.length ||
			opened.entries.some((entry, entryIndex) => {
				const expected = readyEntries[entryIndex];
				return (
					!isRecord(entry) ||
					!expected ||
					entry.id !== expected.id ||
					entry.chef !== expected.chef ||
					entry.perfectServeUnits !== expected.perfectServeUnits
				);
			})
		)
			validationError('serviceQueueOpened queue order must match READY chefs');
		index++;
		const entry = readyEntries[0];
		if (readyEntries.length !== 1 || entry?.chef !== 'italian')
			validationError('Task 3 Service Queue requires Italian as the only next chef');
		if (!entry) validationError('Service Queue entry is required');
		const pasta = events[index];
		if (!pasta || pasta.type !== 'pastaPull')
			validationError('serviceQueueOpened requires one pastaPull');
		validateKnownPayload(pasta);
		if (pasta.queueEntryId !== entry.id) validationError('pastaPull.queueEntryId');
		const positions = requirePositions(pasta.positions, 'pastaPull.positions');
		const visited = new Set<string>([`${positions[0]?.reel}:${positions[0]?.row}`]);
		const pending = [...positions.slice(0, 1)];
		while (pending.length > 0) {
			const position = pending.pop();
			if (!position) continue;
			for (const neighbour of [
				{ reel: position.reel - 1, row: position.row },
				{ reel: position.reel + 1, row: position.row },
				{ reel: position.reel, row: position.row - 1 },
				{ reel: position.reel, row: position.row + 1 },
			]) {
				const key = `${neighbour.reel}:${neighbour.row}`;
				if (positions.some((selected) => positionKey(selected) === key) && !visited.has(key)) {
					visited.add(key);
					pending.push(neighbour);
				}
			}
		}
		if (visited.size !== positions.length)
			validationError('pastaPull.positions must be neighbouring');
		const expectedBoard = currentBoard.map((reel) => [...reel]);
		positions.forEach((position) => {
			const reel = expectedBoard[position.reel];
			if (reel) reel[position.row] = 'pasta_wild';
		});
		if (JSON.stringify(pasta.boardAfter) !== JSON.stringify(expectedBoard))
			validationError('pastaPull.boardAfter');
		const pastaBoard = pasta.boardAfter;
		if (!isBoard(pastaBoard)) validationError('pastaPull.boardAfter');
		currentBoard = pastaBoard;
		index++;
		if (entry.perfectServeUnits > 0) {
			const award = events[index];
			if (!award || award.type !== 'perfectServeAward')
				validationError('unconsumed overflow requires perfectServeAward');
			validateKnownPayload(award);
			if (
				award.queueEntryId !== entry.id ||
				award.consumedOverflowUnits !== entry.perfectServeUnits
			)
				validationError('perfectServeAward must consume all overflow units');
			const awardId = award.id;
			const awardPayout = requireSafeNonNegativeInteger(
				award.payoutAtomicUnits,
				'perfectServeAward.payoutAtomicUnits',
			);
			if (typeof awardId !== 'string' || creditedSources.has(awardId))
				validationError('perfectServeAward ledger source');
			const ledger = events[index + 1];
			if (!ledger || ledger.type !== 'roundWinUpdate')
				validationError('perfectServeAward requires immediate roundWinUpdate');
			validateKnownPayload(ledger);
			if (
				ledger.sourceEventId !== awardId ||
				ledger.creditAtomicUnits !== awardPayout ||
				ledger.balanceAfterAtomicUnits !== balance + awardPayout
			)
				validationError('roundWinUpdate must exactly credit perfectServeAward');
			creditedSources.add(awardId);
			balance += awardPayout;
			index += 2;
		}
		const closed = events[index];
		if (!closed || closed.type !== 'serviceQueueClosed')
			validationError('Pasta Pull service requires serviceQueueClosed');
		validateKnownPayload(closed);
		if (
			closed.queueEntryId !== entry.id ||
			closed.chef !== entry.chef ||
			JSON.stringify(closed.board) !== JSON.stringify(currentBoard)
		)
			validationError('serviceQueueClosed must repeat the final board');
		meters[entry.chef] = 0;
		index++;
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
