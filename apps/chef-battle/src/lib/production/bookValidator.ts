import type {
	Board,
	ChefId,
	CrownCourse,
	CrownMultiplier,
	GameMode,
	MeterValues,
	ProductionBookEvent,
	SauceSpot,
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
const chineseSymbols = new Set<SymbolId>(['peking_duck', 'kung_pao_chicken', 'xiaolongbao']);

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

function validateTotalPayout(payout: number, maxWin: number): void {
	if (payout > maxWin) validationError('payout exceeds maxWinAtomicUnits');
}

function validateCrownHeadroom(
	bonusBank: number,
	crownPot: number,
	multiplier: CrownMultiplier,
	maxWin: number,
): void {
	const finalWin = bonusBank + crownPot * multiplier;
	requireSafeNonNegativeInteger(finalWin, 'Crown outcome');
	if (finalWin > maxWin) validationError('Crown outcome exceeds maxWinAtomicUnits');
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

function requireSauceSpots(value: unknown, field: string, minimum = 0, maximum = 5): SauceSpot[] {
	if (!Array.isArray(value) || value.length < minimum || value.length > maximum)
		validationError(`${field} must contain from ${minimum} to ${maximum} spots`);
	const spots = value.map((spot, index) => {
		if (!isRecord(spot) || Object.keys(spot).length !== 2)
			validationError(`${field}[${index}] must be a Sauce spot`);
		const [position] = requirePositions([spot.position], `${field}[${index}].position`);
		if (!position) validationError(`${field}[${index}].position is required`);
		if (
			typeof spot.boost !== 'number' ||
			!Number.isInteger(spot.boost) ||
			spot.boost < 1 ||
			spot.boost > 9
		)
			validationError(`${field}[${index}].boost must be from 1 to 9`);
		return { position, boost: spot.boost };
	});
	if (new Set(spots.map((spot) => positionKey(spot.position))).size !== spots.length)
		validationError(`${field} must contain unique positions`);
	return spots;
}

function sameSauceSpots(left: readonly SauceSpot[], right: readonly SauceSpot[]): boolean {
	return (
		left.length === right.length &&
		left.every((spot, index) => {
			const other = right[index];
			return (
				other?.boost === spot.boost &&
				other.position.reel === spot.position.reel &&
				other.position.row === spot.position.row
			);
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
	if (mode === 'signatureSpin') {
		if (typeof event.selectedChef !== 'string' || !chefIds.has(event.selectedChef as ChefId))
			validationError('Signature roundStart.selectedChef');
		const expectedMeters: Record<ChefId, number> = {
			italian: event.selectedChef === 'italian' ? 100 : 0,
			french: event.selectedChef === 'french' ? 100 : 0,
			chinese: event.selectedChef === 'chinese' ? 100 : 0,
		};
		if (
			!Array.from(chefIds).every(
				(chef) => (event.meters as Record<ChefId, number>)[chef] === expectedMeters[chef],
			)
		)
			validationError('Signature roundStart meters must ready only selectedChef');
	} else if (event.selectedChef !== undefined)
		validationError('roundStart.selectedChef is only valid for Signature Spin');
	if (event.headliner !== undefined)
		validationError('roundStart.headliner is not a frontend-selected identity');
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
			requireSauceSpots(event.appliedSauceSpots, 'clusterWin.appliedSauceSpots');
			if (
				!isSafeNonNegativeInteger(event.sauceFlightMultiplier) ||
				event.sauceFlightMultiplier < 1 ||
				event.sauceFlightMultiplier > 46
			)
				validationError('clusterWin.sauceFlightMultiplier');
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
			if (!isSafeNonNegativeInteger(event.index) || event.index === 0)
				validationError('cascade.index');
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
		case 'sauceFinish':
			if (typeof event.queueEntryId !== 'string' || event.queueEntryId.length === 0)
				validationError('sauceFinish.queueEntryId');
			requireSauceSpots(event.appliedSpots, 'sauceFinish.appliedSpots', 3);
			requireSauceSpots(event.activeSpots, 'sauceFinish.activeSpots');
			return;
		case 'wokToss':
			if (typeof event.queueEntryId !== 'string' || event.queueEntryId.length === 0)
				validationError('wokToss.queueEntryId');
			if (requirePositions(event.positions, 'wokToss.positions').length < 4)
				validationError('wokToss.positions must contain from four to eight positions');
			if (!Array.isArray(event.positions) || event.positions.length > 8)
				validationError('wokToss.positions must contain from four to eight positions');
			if (
				typeof event.targetSymbol !== 'string' ||
				!chineseSymbols.has(event.targetSymbol as SymbolId)
			)
				validationError('wokToss.targetSymbol must be a Chinese dish');
			if (!isBoard(event.boardAfter)) validationError('wokToss.boardAfter');
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
			if (!isBoard(event.finalBoard)) validationError('serviceQueueClosed.finalBoard');
			return;
		case 'maxWinReached':
			requireSafeNonNegativeInteger(event.maxWinAtomicUnits, 'maxWinReached.maxWinAtomicUnits');
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

function validateBaseLifecycle(
	events: EventRecord[],
	initialSauceSpots: SauceSpot[] = [],
	allowInitialMeters = false,
): number {
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
	const maxWinAtomicUnits = requireSafeNonNegativeInteger(
		roundStart.maxWinAtomicUnits,
		'roundStart.maxWinAtomicUnits',
	);
	if (
		roundStart.mode !== 'base' &&
		roundStart.mode !== 'extraReservation' &&
		roundStart.mode !== 'signatureSpin'
	)
		validationError('unsupported base production lifecycle');
	if (!isMeterValues(roundStart.meters)) validationError('Base roundStart.meters');
	if (
		!allowInitialMeters &&
		roundStart.mode !== 'signatureSpin' &&
		Object.values(roundStart.meters).some((meter) => meter !== 0)
	)
		validationError('Base roundStart.meters must reset to zero');
	if (!isBoard(revealBoard.board)) validationError('revealBoard.board');
	let currentBoard: Board = revealBoard.board;
	let remainingClusters = [...findCanonicalProductionClusters(currentBoard)];

	const meters: Record<ChefId, number> = { ...roundStart.meters };
	const readyEntries: Array<{ id: string; chef: ChefId; perfectServeUnits: number }> = [];
	const initialReadyChefs = Array.from(chefIds).filter((chef) => meters[chef] === 100);
	if (roundStart.mode === 'signatureSpin' || allowInitialMeters) {
		initialReadyChefs.forEach((chef) =>
			readyEntries.push({
				id: `${String(roundStart.roundId)}-service-01-${chef}`,
				chef,
				perfectServeUnits: 0,
			}),
		);
	}
	let activeSauceSpots: SauceSpot[] = initialSauceSpots.map((spot) => ({
		position: { ...spot.position },
		boost: spot.boost,
	}));
	const creditedSources = new Set<string>();
	let balance = 0;
	let index = 2;
	let cascadeIndex = 0;
	let serviceWindowIndex = 1;
	const consumeClusterGroup = (): void => {
		while (remainingClusters.length > 0) {
			const cluster = events[index];
			if (!cluster || cluster.type !== 'clusterWin')
				validationError('all remaining board clusters require a ledger credit');
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
			const expectedAppliedSpots = activeSauceSpots.filter((spot) =>
				expectedCluster.positions.some(
					(position) => positionKey(position) === positionKey(spot.position),
				),
			);
			const appliedSpots = requireSauceSpots(
				cluster.appliedSauceSpots,
				'clusterWin.appliedSauceSpots',
			);
			if (!sameSauceSpots(appliedSpots, expectedAppliedSpots))
				validationError('clusterWin.appliedSauceSpots must be the exact active cluster subset');
			const expectedMultiplier =
				1 + expectedAppliedSpots.reduce((total, spot) => total + spot.boost, 0);
			if (cluster.sauceFlightMultiplier !== expectedMultiplier)
				validationError('clusterWin.sauceFlightMultiplier');
			const basePayout = requireSafeNonNegativeInteger(
				cluster.basePayoutAtomicUnits,
				'clusterWin.basePayoutAtomicUnits',
			);
			const payout = requireSafeNonNegativeInteger(
				cluster.payoutAtomicUnits,
				'clusterWin.payoutAtomicUnits',
			);
			if (payout !== basePayout * expectedMultiplier)
				validationError('clusterWin.payoutAtomicUnits must trust the supplied Sauce Flight result');
			const ledger = events[index + 1];
			if (!ledger || ledger.type !== 'roundWinUpdate')
				validationError('clusterWin requires immediate roundWinUpdate');
			validateKnownPayload(ledger);
			if (
				ledger.sourceEventId !== cluster.id ||
				creditedSources.has(ledger.sourceEventId as string)
			)
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
			validateTotalPayout(balance, maxWinAtomicUnits);
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
			const expectedApplied = Math.min(earned, 100 - meters[chef]);
			const expectedOverflow = earned - expectedApplied;
			const expectedMeterAfter = Math.min(100, meters[chef] + earned);
			if (
				applied !== expectedApplied ||
				overflow !== expectedOverflow ||
				meterAfter !== expectedMeterAfter
			)
				validationError('chefMeterUpdate charge fields');
			const existingEntry = readyEntries.find((entry) => entry.chef === chef);
			if (meterAfter === 100) {
				const expectedId =
					existingEntry?.id ??
					`${roundStart.roundId}-service-${String(serviceWindowIndex).padStart(2, '0')}-${chef}`;
				const expectedUnits = (existingEntry?.perfectServeUnits ?? 0) + overflow;
				if (
					meter.serviceQueueEntryId !== expectedId ||
					meter.perfectServeUnitsAfter !== expectedUnits
				)
					validationError('chefMeterUpdate service queue fields');
				if (existingEntry) existingEntry.perfectServeUnits = expectedUnits;
				else readyEntries.push({ id: expectedId, chef, perfectServeUnits: expectedUnits });
			} else if (meter.serviceQueueEntryId !== null || meter.perfectServeUnitsAfter !== 0)
				validationError('chefMeterUpdate service queue fields');
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
		}
	};
	const consumeServiceWindow = (): void => {
		const opened = events[index];
		if (!opened || opened.type !== 'serviceQueueOpened')
			validationError('READY chefs require serviceQueueOpened after boardSettled');
		validateKnownPayload(opened);
		const openingExpected =
			serviceWindowIndex === 1 &&
			(roundStart.mode === 'signatureSpin' || (allowInitialMeters && initialReadyChefs.length > 0));
		if (openingExpected) {
			if (opened.phase !== 'opening' || opened.source !== 'initialReady')
				validationError('opening Service requires phase=opening and source=initialReady');
		} else if (opened.phase !== undefined || opened.source !== undefined)
			validationError('opening Service metadata is only valid for initialReady');
		if (
			!Array.isArray(opened.entries) ||
			opened.entries.length !== readyEntries.length ||
			opened.entries.some((entry, entryIndex) => {
				const expected = readyEntries[entryIndex];
				return (
					!isRecord(entry) ||
					!expected ||
					Object.keys(entry).length !== 3 ||
					entry.id !== expected.id ||
					entry.chef !== expected.chef ||
					entry.perfectServeUnits !== expected.perfectServeUnits
				);
			})
		)
			validationError('serviceQueueOpened queue order must match READY chefs');
		index++;
		const pastaPositionKeys = new Set<string>();
		const wokPositionKeys = new Set<string>();
		for (const entry of readyEntries) {
			const special = events[index];
			if (!special) validationError('Service Queue entry requires a Chef Special');
			if (special.queueEntryId !== entry.id) validationError('Chef Special queueEntryId');

			if (entry.chef === 'italian') {
				if (special.type !== 'pastaPull')
					validationError('Italian Service Queue entry requires pastaPull');
				validateKnownPayload(special);
				const positions = requirePositions(special.positions, 'pastaPull.positions');
				if (positions.some((position) => wokPositionKeys.has(positionKey(position))))
					validationError('Pasta Pull and Wok Toss positions must not overlap');
				const visited = new Set<string>([positionKey(positions[0] as Position)]);
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
						const key = positionKey(neighbour);
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
					pastaPositionKeys.add(positionKey(position));
				});
				if (JSON.stringify(special.boardAfter) !== JSON.stringify(expectedBoard))
					validationError('pastaPull.boardAfter');
				if (!isBoard(special.boardAfter)) validationError('pastaPull.boardAfter');
				currentBoard = special.boardAfter;
			} else if (entry.chef === 'french') {
				if (special.type !== 'sauceFinish')
					validationError('French Service Queue entry requires sauceFinish');
				validateKnownPayload(special);
				const writes = requireSauceSpots(special.appliedSpots, 'sauceFinish.appliedSpots', 3);
				const replacements = new Map(
					activeSauceSpots.map((spot) => [positionKey(spot.position), spot]),
				);
				writes.forEach((spot) => replacements.set(positionKey(spot.position), spot));
				if (replacements.size > 5)
					validationError('Sauce Finish cannot exceed five active positions');
				const expectedActive = [...replacements.values()].sort((left, right) =>
					comparePosition(left.position, right.position),
				);
				const active = requireSauceSpots(special.activeSpots, 'sauceFinish.activeSpots');
				if (!sameSauceSpots(active, expectedActive))
					validationError('sauceFinish.activeSpots must be the sorted full active snapshot');
				activeSauceSpots = active;
			} else {
				if (special.type !== 'wokToss')
					validationError('Chinese Service Queue entry requires wokToss');
				validateKnownPayload(special);
				const positions = requirePositions(special.positions, 'wokToss.positions');
				if (positions.some((position) => pastaPositionKeys.has(positionKey(position))))
					validationError('Pasta Pull and Wok Toss positions must not overlap');
				const beforeClusters = findCanonicalProductionClusters(currentBoard).filter(
					(cluster) => cluster.chef === 'chinese',
				);
				const expectedBoard = currentBoard.map((reel) => [...reel]);
				positions.forEach((position) => {
					const reel = expectedBoard[position.reel];
					if (reel) reel[position.row] = special.targetSymbol as SymbolId;
					wokPositionKeys.add(positionKey(position));
				});
				if (JSON.stringify(special.boardAfter) !== JSON.stringify(expectedBoard))
					validationError('wokToss.boardAfter');
				if (!isBoard(special.boardAfter)) validationError('wokToss.boardAfter');
				const createsOrExpands = findCanonicalProductionClusters(special.boardAfter).some(
					(cluster) => {
						if (
							cluster.chef !== 'chinese' ||
							!cluster.positions.some((position) => wokPositionKeys.has(positionKey(position)))
						)
							return false;
						const afterKeys = new Set(cluster.positions.map(positionKey));
						return !beforeClusters.some(
							(before) =>
								before.symbol === cluster.symbol &&
								[...afterKeys].every((key) =>
									before.positions.some((position) => positionKey(position) === key),
								),
						);
					},
				);
				if (!createsOrExpands) validationError('wokToss must create or expand a Chinese cluster');
				currentBoard = special.boardAfter;
			}

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
				validateTotalPayout(balance, maxWinAtomicUnits);
				index += 2;
			} else if (events[index]?.type === 'perfectServeAward') {
				validationError('Perfect Serve payout requires overflow units');
			}
			meters[entry.chef] = 0;
		}
		const closed = events[index];
		if (!closed || closed.type !== 'serviceQueueClosed')
			validationError('Service Queue requires serviceQueueClosed');
		validateKnownPayload(closed);
		if (JSON.stringify(closed.finalBoard) !== JSON.stringify(currentBoard))
			validationError('serviceQueueClosed.finalBoard must repeat the final board');
		index++;
		readyEntries.splice(0);
		serviceWindowIndex++;
	};
	while (remainingClusters.length > 0 || readyEntries.length > 0) {
		if (readyEntries.length > 0) {
			consumeServiceWindow();
			remainingClusters = [...findCanonicalProductionClusters(currentBoard)];
			continue;
		}
		consumeClusterGroup();
		cascadeIndex++;
		const cascade = events[index];
		const settled = events[index + 1];
		if (!cascade || cascade.type !== 'cascade') validationError('Base clusters require cascade');
		if (cascade.index !== cascadeIndex)
			validationError('cascade.index must increment for each cluster group');
		if (!settled || settled.type !== 'boardSettled')
			validationError('cascade requires boardSettled');
		validateKnownPayload(cascade);
		validateKnownPayload(settled);
		if (!isBoard(settled.board)) validationError('boardSettled.board');
		currentBoard = settled.board;
		remainingClusters = [...findCanonicalProductionClusters(currentBoard)];
		index += 2;
	}
	if (balance === maxWinAtomicUnits) {
		const maxEvent = events[index];
		if (!maxEvent || maxEvent.type !== 'maxWinReached')
			validationError('exact cap requires maxWinReached after the drained Service Queue');
		validateKnownPayload(maxEvent);
		if (maxEvent.maxWinAtomicUnits !== maxWinAtomicUnits)
			validationError('maxWinReached must announce the exact round cap');
		index++;
	} else if (events[index]?.type === 'maxWinReached')
		validationError('maxWinReached requires the exact cap');
	const total = events[index];
	const final = events[index + 1];
	if (
		!total ||
		!final ||
		index + 2 !== events.length ||
		total.type !== 'setTotalWin' ||
		final.type !== 'finalWin'
	)
		validationError('Base round must end maxWinReached? → setTotalWin → finalWin');
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

function requireChefValues(value: unknown, field: string, maximum: number): Record<ChefId, number> {
	if (
		!isRecord(value) ||
		Object.keys(value).length !== chefIds.size ||
		!Array.from(chefIds).every(
			(chef) => isSafeNonNegativeInteger(value[chef]) && value[chef] <= maximum,
		)
	)
		validationError(`${field} must contain all chefs from 0 to ${maximum}`);
	return {
		italian: value.italian as number,
		french: value.french as number,
		chinese: value.chinese as number,
	};
}

function requireCourses(value: unknown, field: string): CrownCourse[] {
	if (!Array.isArray(value)) validationError(`${field} must be an array`);
	const ids = new Set<string>();
	const sources = new Set<string>();
	return value.map((rawCourse, index) => {
		if (
			!isRecord(rawCourse) ||
			Object.keys(rawCourse).length !== 4 ||
			typeof rawCourse.id !== 'string' ||
			rawCourse.id.length === 0 ||
			ids.has(rawCourse.id) ||
			typeof rawCourse.chef !== 'string' ||
			!chefIds.has(rawCourse.chef as ChefId) ||
			typeof rawCourse.sourceEventId !== 'string' ||
			rawCourse.sourceEventId.length === 0 ||
			sources.has(rawCourse.sourceEventId)
		)
			validationError(`${field}[${index}] must be a unique Crown Course`);
		const valueAtomicUnits = requireSafeNonNegativeInteger(
			rawCourse.valueAtomicUnits,
			`${field}[${index}].valueAtomicUnits`,
		);
		if (valueAtomicUnits === 0) validationError('Crown Course value must be positive');
		ids.add(rawCourse.id);
		sources.add(rawCourse.sourceEventId);
		return {
			id: rawCourse.id,
			chef: rawCourse.chef as ChefId,
			sourceEventId: rawCourse.sourceEventId,
			valueAtomicUnits,
		};
	});
}

function sameCourses(left: readonly CrownCourse[], right: readonly CrownCourse[]): boolean {
	return (
		left.length === right.length &&
		left.every((course, index) => {
			const other = right[index];
			return (
				other?.id === course.id &&
				other.chef === course.chef &&
				other.sourceEventId === course.sourceEventId &&
				other.valueAtomicUnits === course.valueAtomicUnits
			);
		})
	);
}

type MutableShowdownState = {
	totalFreeSpins: number;
	currentFreeSpin: number;
	remainingFreeSpins: number;
	meters: Record<ChefId, number>;
	stars: Record<ChefId, number>;
	completedCourses: CrownCourse[];
	bonusBankAtomicUnits: number;
	crownPotAtomicUnits: number;
	activeSauceSpots: SauceSpot[];
	winner: ChefId | null;
	headliner: ChefId | null;
};

function readShowdownSnapshot(event: EventRecord, field: string): MutableShowdownState {
	const totalFreeSpins = requireSafeNonNegativeInteger(
		event.totalFreeSpins,
		`${field}.totalFreeSpins`,
	);
	const currentFreeSpin = requireSafeNonNegativeInteger(
		event.currentFreeSpin,
		`${field}.currentFreeSpin`,
	);
	const remainingFreeSpins = requireSafeNonNegativeInteger(
		event.remainingFreeSpins,
		`${field}.remainingFreeSpins`,
	);
	const meters = requireChefValues(event.meters, `${field}.meters`, 100);
	const stars = requireChefValues(event.stars, `${field}.stars`, 3);
	const completedCourses = requireCourses(event.completedCourses, `${field}.completedCourses`);
	const bonusBankAtomicUnits = requireSafeNonNegativeInteger(
		event.bonusBankAtomicUnits,
		`${field}.bonusBankAtomicUnits`,
	);
	const crownPotAtomicUnits = requireSafeNonNegativeInteger(
		event.crownPotAtomicUnits,
		`${field}.crownPotAtomicUnits`,
	);
	const activeSauceSpots = requireSauceSpots(event.activeSauceSpots, `${field}.activeSauceSpots`);
	if (
		event.winner !== null &&
		(typeof event.winner !== 'string' || !chefIds.has(event.winner as ChefId))
	)
		validationError(`${field}.winner`);
	if (
		event.headliner !== null &&
		(typeof event.headliner !== 'string' || !chefIds.has(event.headliner as ChefId))
	)
		validationError(`${field}.headliner`);
	return {
		totalFreeSpins,
		currentFreeSpin,
		remainingFreeSpins,
		meters,
		stars,
		completedCourses,
		bonusBankAtomicUnits,
		crownPotAtomicUnits,
		activeSauceSpots,
		winner: event.winner as ChefId | null,
		headliner: event.headliner as ChefId | null,
	};
}

function assertShowdownSnapshot(
	event: EventRecord,
	expected: MutableShowdownState,
	field: string,
): void {
	const actual = readShowdownSnapshot(event, field);
	if (
		actual.totalFreeSpins !== expected.totalFreeSpins ||
		actual.currentFreeSpin !== expected.currentFreeSpin ||
		actual.remainingFreeSpins !== expected.remainingFreeSpins ||
		!Array.from(chefIds).every(
			(chef) =>
				actual.meters[chef] === expected.meters[chef] &&
				actual.stars[chef] === expected.stars[chef],
		) ||
		!sameCourses(actual.completedCourses, expected.completedCourses) ||
		actual.bonusBankAtomicUnits !== expected.bonusBankAtomicUnits ||
		actual.crownPotAtomicUnits !== expected.crownPotAtomicUnits ||
		!sameSauceSpots(actual.activeSauceSpots, expected.activeSauceSpots) ||
		actual.winner !== expected.winner ||
		actual.headliner !== expected.headliner
	)
		validationError(`${field} snapshot does not match exact Math state`);
}

function validateShowdownBoardPhase(
	roundStart: EventRecord,
	board: Board,
	phase: readonly EventRecord[],
	initialMeters: Readonly<Record<ChefId, number>>,
	initialSauceSpots: readonly SauceSpot[],
	phaseId: string,
): void {
	let localBalance = 0;
	let localCascadeIndex = 0;
	let localServiceWindowIndex = 1;
	const serviceIds = new Map<string, string>();
	const syntheticEvents: EventRecord[] = [
		{
			...roundStart,
			roundId: phaseId,
			mode: 'base',
			paidBetAtomicUnits: roundStart.betAtomicUnits,
			meters: { ...initialMeters },
		},
		{ type: 'revealBoard', board: board.map((reel) => [...reel]) },
	];

	const mapServiceId = (original: string, chef: ChefId): string => {
		const existing = serviceIds.get(original);
		if (existing) return existing;
		const mapped = `${phaseId}-service-${String(localServiceWindowIndex).padStart(2, '0')}-${chef}`;
		serviceIds.set(original, mapped);
		return mapped;
	};

	for (const original of phase) {
		if (
			original.type === 'crownCourseComplete' ||
			original.type === 'judgeStarUpdate' ||
			original.type === 'kitchenWinnerLocked'
		)
			continue;
		const cloned = structuredClone(original) as EventRecord;
		if (cloned.type === 'chefMeterUpdate' && typeof cloned.serviceQueueEntryId === 'string') {
			if (typeof cloned.chef !== 'string' || !chefIds.has(cloned.chef as ChefId))
				validationError('chefMeterUpdate.chef');
			cloned.serviceQueueEntryId = mapServiceId(cloned.serviceQueueEntryId, cloned.chef as ChefId);
		}
		if (cloned.type === 'serviceQueueOpened' && Array.isArray(cloned.entries)) {
			cloned.entries = cloned.entries.map((rawEntry) => {
				if (
					!isRecord(rawEntry) ||
					typeof rawEntry.id !== 'string' ||
					typeof rawEntry.chef !== 'string' ||
					!chefIds.has(rawEntry.chef as ChefId)
				)
					validationError('serviceQueueOpened.entries');
				return {
					...rawEntry,
					id: mapServiceId(rawEntry.id, rawEntry.chef as ChefId),
				};
			});
		}
		if (typeof cloned.queueEntryId === 'string') {
			const mapped = serviceIds.get(cloned.queueEntryId);
			if (!mapped) validationError('Chef Special queueEntryId');
			cloned.queueEntryId = mapped;
		}
		if (cloned.type === 'bonusBankUpdate') {
			const credit = requireSafeNonNegativeInteger(
				cloned.creditAtomicUnits,
				'bonusBankUpdate.creditAtomicUnits',
			);
			localBalance += credit;
			cloned.type = 'roundWinUpdate';
			cloned.balanceAfterAtomicUnits = localBalance;
		}
		if (cloned.type === 'cascade') {
			localCascadeIndex++;
			cloned.index = localCascadeIndex;
		}
		syntheticEvents.push(cloned);
		if (cloned.type === 'serviceQueueClosed') localServiceWindowIndex++;
	}
	syntheticEvents.push(
		{ type: 'setTotalWin', totalWinAtomicUnits: localBalance },
		{ type: 'finalWin', payoutAtomicUnits: localBalance },
	);
	validateBaseLifecycle(syntheticEvents, [...initialSauceSpots], true);
}

function validateShowdownLifecycle(events: EventRecord[]): number {
	const roundStart = events[0];
	if (!roundStart || roundStart.type !== 'roundStart') validationError('roundStart is required');
	validateRoundStart(roundStart);
	const roundId = roundStart.roundId;
	if (typeof roundId !== 'string') validationError('roundStart.roundId');
	const maxWinAtomicUnits = requireSafeNonNegativeInteger(
		roundStart.maxWinAtomicUnits,
		'roundStart.maxWinAtomicUnits',
	);
	const crowns = events.filter((bookEvent) => bookEvent.type === 'kitchenCrownReveal');
	const selectedMultiplier = crowns[0]?.multiplier;
	const multipliers = new Set<CrownMultiplier>([2, 3, 4, 5, 10, 20, 50, 100]);
	if (
		crowns.length !== 1 ||
		typeof selectedMultiplier !== 'number' ||
		!multipliers.has(selectedMultiplier as CrownMultiplier)
	)
		validationError('Showdown requires one valid Kitchen Crown multiplier');
	let headroomBank = 0;
	let headroomPot = 0;
	events.forEach((bookEvent) => {
		if (bookEvent.type === 'bonusBankUpdate')
			headroomBank = requireSafeNonNegativeInteger(
				bookEvent.balanceAfterAtomicUnits,
				'bonusBankUpdate.balanceAfterAtomicUnits',
			);
		if (bookEvent.type === 'crownCourseComplete')
			headroomPot = requireSafeNonNegativeInteger(
				bookEvent.crownPotAfterAtomicUnits,
				'crownCourseComplete.crownPotAfterAtomicUnits',
			);
		if (bookEvent.type === 'bonusBankUpdate' || bookEvent.type === 'crownCourseComplete')
			validateCrownHeadroom(
				headroomBank,
				headroomPot,
				selectedMultiplier as CrownMultiplier,
				maxWinAtomicUnits,
			);
	});

	const bankBeforeIndex: number[] = [];
	let bank = 0;
	const creditedSources = new Set<string>();
	events.forEach((bookEvent, index) => {
		bankBeforeIndex[index] = bank;
		if (bookEvent.type === 'roundWinUpdate')
			validationError('Showdown payout source cannot enter the round ledger');
		if (bookEvent.type !== 'bonusBankUpdate') return;
		const source = events[index - 1];
		if (
			!source ||
			(source.type !== 'clusterWin' && source.type !== 'perfectServeAward') ||
			bookEvent.sourceEventId !== source.id ||
			typeof bookEvent.sourceEventId !== 'string' ||
			creditedSources.has(bookEvent.sourceEventId)
		)
			validationError('Showdown ledger must credit one unique payout source immediately');
		const credit = requireSafeNonNegativeInteger(
			bookEvent.creditAtomicUnits,
			'bonusBankUpdate.creditAtomicUnits',
		);
		const sourcePayout = requireSafeNonNegativeInteger(
			source.payoutAtomicUnits,
			`${String(source.type)}.payoutAtomicUnits`,
		);
		const balanceAfter = requireSafeNonNegativeInteger(
			bookEvent.balanceAfterAtomicUnits,
			'bonusBankUpdate.balanceAfterAtomicUnits',
		);
		if (credit !== sourcePayout || balanceAfter !== bank + credit)
			validationError('bonusBankUpdate must exactly replace the protected Bank balance');
		creditedSources.add(bookEvent.sourceEventId);
		bank = balanceAfter;
	});
	let serviceWindowIndex = 1;
	events.forEach((bookEvent) => {
		if (bookEvent.type === 'chefMeterUpdate' && typeof bookEvent.serviceQueueEntryId === 'string') {
			if (typeof bookEvent.chef !== 'string' || !chefIds.has(bookEvent.chef as ChefId))
				validationError('chefMeterUpdate.chef');
			const expected = `${roundId}-service-${String(serviceWindowIndex).padStart(2, '0')}-${bookEvent.chef}`;
			if (bookEvent.serviceQueueEntryId !== expected)
				validationError('Showdown service queue identity must be canonical');
		}
		if (bookEvent.type === 'serviceQueueOpened') {
			if (!Array.isArray(bookEvent.entries)) validationError('serviceQueueOpened.entries');
			bookEvent.entries.forEach((rawEntry) => {
				if (
					!isRecord(rawEntry) ||
					typeof rawEntry.chef !== 'string' ||
					!chefIds.has(rawEntry.chef as ChefId) ||
					rawEntry.id !==
						`${roundId}-service-${String(serviceWindowIndex).padStart(2, '0')}-${rawEntry.chef}`
				)
					validationError('Showdown service queue identity must be canonical');
			});
		}
		if (bookEvent.type === 'serviceQueueClosed') serviceWindowIndex++;
	});

	let startIndex: number;
	let entryKind: 'natural' | 'purchase';
	if (roundStart.mode === 'base' || roundStart.mode === 'extraReservation') {
		const reveal = events[1];
		const trigger = events[2];
		if (!reveal || reveal.type !== 'revealBoard' || !isBoard(reveal.board))
			validationError('natural Showdown requires the initial reveal');
		if (!trigger || trigger.type !== 'kitchenShowdownTriggered')
			validationError('natural trigger must follow the initial reveal');
		const scatterPositions = requirePositions(
			trigger.scatterPositions,
			'kitchenShowdownTriggered.scatterPositions',
		);
		const expectedScatters: Position[] = [];
		reveal.board.forEach((reel, reelIndex) =>
			reel.forEach((symbol, row) => {
				if (symbol === 'kitchen_crown_scatter') expectedScatters.push({ reel: reelIndex, row });
			}),
		);
		if (
			scatterPositions.length < 3 ||
			!samePositions(scatterPositions, expectedScatters) ||
			trigger.awardedFreeSpins !== 10
		)
			validationError('natural trigger scatter snapshot');
		startIndex = events.findIndex((bookEvent) => bookEvent.type === 'kitchenShowdownStart');
		if (startIndex < 3)
			validationError('natural trigger cascade must finish before Showdown start');
		validateShowdownBoardPhase(
			roundStart,
			reveal.board,
			events.slice(3, startIndex),
			requireChefValues(roundStart.meters, 'roundStart.meters', 100),
			[],
			`${roundId}-trigger`,
		);
		entryKind = 'natural';
	} else if (
		roundStart.mode === 'kitchenShowdown' ||
		roundStart.mode === 'grandShowdown' ||
		roundStart.mode === 'mysteryTasting'
	) {
		if (
			Object.values(requireChefValues(roundStart.meters, 'roundStart.meters', 100)).some(
				(value) => value !== 0,
			)
		)
			validationError('purchased roundStart meters must reset to zero');
		startIndex = 1;
		entryKind = 'purchase';
	} else validationError('Kitchen Showdown mode is invalid');

	const start = events[startIndex];
	if (!start || start.type !== 'kitchenShowdownStart' || start.entryKind !== entryKind)
		validationError('kitchenShowdownStart.entryKind');
	const state = readShowdownSnapshot(start, 'kitchenShowdownStart');
	if (
		state.currentFreeSpin !== 0 ||
		state.remainingFreeSpins !== state.totalFreeSpins ||
		state.winner !== null ||
		state.bonusBankAtomicUnits !== bankBeforeIndex[startIndex] ||
		state.crownPotAtomicUnits !==
			state.completedCourses.reduce((sum, course) => sum + course.valueAtomicUnits, 0) ||
		(entryKind === 'natural' && state.activeSauceSpots.length !== 0)
	)
		validationError('kitchenShowdownStart snapshot');
	if (
		roundStart.mode === 'base' ||
		roundStart.mode === 'extraReservation' ||
		roundStart.mode === 'kitchenShowdown'
	) {
		if (
			state.totalFreeSpins !== 10 ||
			state.completedCourses.length !== 0 ||
			state.crownPotAtomicUnits !== 0 ||
			Object.values(state.stars).some((value) => value !== 0) ||
			!Array.from(chefIds).every((chef) => state.meters[chef] === 50) ||
			state.headliner !== null
		)
			validationError('Kitchen Showdown start snapshot');
	} else if (roundStart.mode === 'grandShowdown') {
		if (
			state.totalFreeSpins !== 10 ||
			!Array.from(chefIds).every((chef) => state.meters[chef] === 75 && state.stars[chef] === 1) ||
			state.completedCourses.length !== 3 ||
			!(['italian', 'french', 'chinese'] as const).every(
				(chef, index) => state.completedCourses[index]?.chef === chef,
			) ||
			state.headliner !== null
		)
			validationError(
				'Grand Showdown start requires meters 75, one star and one matching positive Course per chef',
			);
	} else if (roundStart.mode === 'mysteryTasting') {
		const headliner = state.headliner;
		if (
			headliner === null ||
			state.totalFreeSpins !== 12 ||
			!Array.from(chefIds).every(
				(chef) =>
					state.meters[chef] === (chef === headliner ? 100 : 50) &&
					state.stars[chef] === (chef === headliner ? 1 : 0),
			) ||
			state.completedCourses.length !== 1 ||
			state.completedCourses[0]?.chef !== headliner
		)
			validationError(
				'Mystery Tasting start requires Headliner meter 100, one star and one matching positive Course',
			);
	}
	validateCrownHeadroom(
		state.bonusBankAtomicUnits,
		state.crownPotAtomicUnits,
		selectedMultiplier as CrownMultiplier,
		maxWinAtomicUnits,
	);

	let cursor = startIndex + 1;
	const courseSources = new Set<string>(
		state.completedCourses.map((course) => course.sourceEventId),
	);
	const consumedCourseMeta = new Set<EventRecord>();
	for (let spin = 1; spin <= state.totalFreeSpins; spin++) {
		const spinStart = events[cursor];
		if (!spinStart || spinStart.type !== 'freeSpinStart' || !isBoard(spinStart.board))
			validationError('all Showdown free spins must play');
		if (
			spinStart.currentFreeSpin !== spin ||
			spinStart.remainingFreeSpins !== state.totalFreeSpins - spin ||
			spinStart.board.some((reel) => reel.includes('pasta_wild'))
		)
			validationError('freeSpinStart counters or temporary Pasta state');
		const endIndex = events.findIndex(
			(bookEvent, index) => index > cursor && bookEvent.type === 'freeSpinEnd',
		);
		if (endIndex < 0) validationError('free spin requires freeSpinEnd snapshot');
		const phase = events.slice(cursor + 1, endIndex);
		const retriggers = phase.filter((bookEvent) => bookEvent.type === 'freeSpinRetrigger');
		if (retriggers.length > 1)
			validationError('free spin accepts at most one retrigger after its settled flow');
		const retrigger = retriggers[0];
		if (retrigger && phase.at(-1) !== retrigger)
			validationError('freeSpinRetrigger must follow the drained Service Queue and settled flow');
		const boardPhase = retrigger ? phase.slice(0, -1) : phase;
		validateShowdownBoardPhase(
			roundStart,
			spinStart.board,
			boardPhase,
			state.meters,
			state.activeSauceSpots,
			`${roundId}-spin-${String(spin).padStart(2, '0')}`,
		);
		if (retrigger) {
			const scatterPositions = requirePositions(
				retrigger.scatterPositions,
				'freeSpinRetrigger.scatterPositions',
			);
			const expectedScatters: Position[] = [];
			spinStart.board.forEach((reel, reelIndex) =>
				reel.forEach((symbol, row) => {
					if (symbol === 'kitchen_crown_scatter') expectedScatters.push({ reel: reelIndex, row });
				}),
			);
			if (
				scatterPositions.length !== 3 ||
				!samePositions(scatterPositions, expectedScatters) ||
				retrigger.awardedFreeSpins !== 3 ||
				retrigger.remainingFreeSpinsAfter !== state.totalFreeSpins - spin + 3
			)
				validationError(
					'freeSpinRetrigger must preserve the scatter snapshot and add exactly three',
				);
		}

		let openEntries: Array<{ id: string; chef: ChefId; perfectServeUnits: number }> = [];
		let courseIndexInWindow = 0;
		const specialByEntry = new Map<string, { event: EventRecord; index: number }>();
		const consumedMeta = new Set<number>();
		boardPhase.forEach((bookEvent, phaseIndex) => {
			if (consumedMeta.has(phaseIndex)) return;
			if (bookEvent.type === 'chefMeterUpdate') {
				if (typeof bookEvent.chef !== 'string' || !chefIds.has(bookEvent.chef as ChefId))
					validationError('chefMeterUpdate.chef');
				state.meters[bookEvent.chef as ChefId] = requireSafeNonNegativeInteger(
					bookEvent.meterAfter,
					'chefMeterUpdate.meterAfter',
				);
			}
			if (bookEvent.type === 'sauceFinish')
				state.activeSauceSpots = requireSauceSpots(
					bookEvent.activeSpots,
					'sauceFinish.activeSpots',
				);
			if (bookEvent.type === 'serviceQueueOpened') {
				if (!Array.isArray(bookEvent.entries)) validationError('serviceQueueOpened.entries');
				openEntries = bookEvent.entries.map((rawEntry) => {
					if (
						!isRecord(rawEntry) ||
						typeof rawEntry.id !== 'string' ||
						typeof rawEntry.chef !== 'string' ||
						!chefIds.has(rawEntry.chef as ChefId) ||
						!isSafeNonNegativeInteger(rawEntry.perfectServeUnits)
					)
						validationError('serviceQueueOpened.entries');
					return {
						id: rawEntry.id,
						chef: rawEntry.chef as ChefId,
						perfectServeUnits: rawEntry.perfectServeUnits,
					};
				});
				courseIndexInWindow = 0;
			}
			if (
				bookEvent.type === 'pastaPull' ||
				bookEvent.type === 'sauceFinish' ||
				bookEvent.type === 'wokToss'
			) {
				if (typeof bookEvent.queueEntryId !== 'string')
					validationError('Chef Special queueEntryId');
				specialByEntry.set(bookEvent.queueEntryId, { event: bookEvent, index: phaseIndex });
			}
			if (bookEvent.type === 'crownCourseComplete') {
				const expectedEntry = openEntries[courseIndexInWindow];
				const special = expectedEntry ? specialByEntry.get(expectedEntry.id) : undefined;
				const value = requireSafeNonNegativeInteger(
					bookEvent.courseValueAtomicUnits,
					'crownCourseComplete.courseValueAtomicUnits',
				);
				if (value === 0) validationError('Crown Course value must be positive');
				if (
					!expectedEntry ||
					!special ||
					bookEvent.queueEntryId !== expectedEntry.id ||
					bookEvent.chef !== expectedEntry.chef ||
					bookEvent.sourceEventId !== special.event.id ||
					typeof bookEvent.sourceEventId !== 'string' ||
					courseSources.has(bookEvent.sourceEventId) ||
					creditedSources.has(bookEvent.sourceEventId) ||
					bookEvent.courseId !==
						`${roundId}-course-${String(state.completedCourses.length + 1).padStart(2, '0')}`
				)
					validationError('Crown Course source or order');
				const afterSpecial = boardPhase[special.index + 1];
				const expectedCourseIndex =
					afterSpecial?.type === 'perfectServeAward' ? special.index + 3 : special.index + 1;
				if (phaseIndex !== expectedCourseIndex)
					validationError('Crown Course must immediately follow its service payout chain');
				courseSources.add(bookEvent.sourceEventId);
				state.crownPotAtomicUnits += value;
				validateCrownHeadroom(
					state.bonusBankAtomicUnits,
					state.crownPotAtomicUnits,
					selectedMultiplier as CrownMultiplier,
					maxWinAtomicUnits,
				);
				state.completedCourses.push({
					id: bookEvent.courseId as string,
					chef: expectedEntry.chef,
					sourceEventId: bookEvent.sourceEventId,
					valueAtomicUnits: value,
				});
				if (
					bookEvent.crownPotAfterAtomicUnits !== state.crownPotAtomicUnits ||
					!sameCourses(
						requireCourses(bookEvent.completedCourses, 'crownCourseComplete.completedCourses'),
						state.completedCourses,
					)
				)
					validationError('Crown Course Pot snapshot');
				courseIndexInWindow++;

				const next = boardPhase[phaseIndex + 1];
				if (state.winner === null) {
					if (!next || next.type !== 'judgeStarUpdate')
						validationError('each pre-lock Course requires one Judge Star');
					if (consumedCourseMeta.has(next))
						validationError('Showdown meta event cannot serve two canonical Course chains');
					const expectedStars = { ...state.stars };
					expectedStars[expectedEntry.chef]++;
					if (
						next.chef !== expectedEntry.chef ||
						next.starsAfter !== expectedStars[expectedEntry.chef] ||
						!Array.from(chefIds).every(
							(chef) =>
								requireChefValues(next.stars, 'judgeStarUpdate.stars', 3)[chef] ===
								expectedStars[chef],
						)
					)
						validationError('Judge Star snapshot');
					state.stars = expectedStars;
					consumedCourseMeta.add(next);
					consumedMeta.add(phaseIndex + 1);
					if (expectedStars[expectedEntry.chef] === 3) {
						const lock = boardPhase[phaseIndex + 2];
						const expectedHeadliner =
							roundStart.mode === 'mysteryTasting' ? state.headliner : expectedEntry.chef;
						if (
							!lock ||
							lock.type !== 'kitchenWinnerLocked' ||
							lock.winner !== expectedEntry.chef ||
							lock.headliner !== expectedHeadliner ||
							!Array.from(chefIds).every(
								(chef) =>
									requireChefValues(lock.stars, 'kitchenWinnerLocked.stars', 3)[chef] ===
									expectedStars[chef],
							)
						)
							validationError('third Judge Star must immediately lock winner');
						if (consumedCourseMeta.has(lock))
							validationError('Showdown meta event cannot serve two canonical Course chains');
						state.winner = expectedEntry.chef;
						if (roundStart.mode !== 'mysteryTasting') state.headliner = expectedEntry.chef;
						consumedCourseMeta.add(lock);
						consumedMeta.add(phaseIndex + 2);
					}
				} else if (next?.type === 'judgeStarUpdate')
					validationError('winner is locked; later services cannot change stars');
			}
			if (bookEvent.type === 'serviceQueueClosed') {
				if (courseIndexInWindow !== openEntries.length)
					validationError('every Showdown service requires one Crown Course');
				openEntries.forEach((entry) => {
					state.meters[entry.chef] = 0;
				});
				openEntries = [];
			}
		});

		if (retrigger) state.totalFreeSpins += 3;
		state.currentFreeSpin = spin;
		state.remainingFreeSpins = state.totalFreeSpins - spin;
		state.bonusBankAtomicUnits = bankBeforeIndex[endIndex] as number;
		const spinEnd = events[endIndex];
		if (!spinEnd) validationError('freeSpinEnd is required');
		assertShowdownSnapshot(spinEnd, state, 'freeSpinEnd');
		cursor = endIndex + 1;
	}
	if (
		events.some(
			(bookEvent) =>
				(bookEvent.type === 'judgeStarUpdate' || bookEvent.type === 'kitchenWinnerLocked') &&
				!consumedCourseMeta.has(bookEvent),
		)
	)
		validationError('every Judge Star and winner lock must belong to one canonical Course chain');

	const crown = events[cursor];
	if (!crown || crown.type !== 'kitchenCrownReveal')
		validationError('Showdown must end with kitchenCrownReveal');
	if (typeof crown.multiplier !== 'number' || !multipliers.has(crown.multiplier as CrownMultiplier))
		validationError('Kitchen Crown multiplier');
	const crownPayout = requireSafeNonNegativeInteger(
		crown.crownPayoutAtomicUnits,
		'kitchenCrownReveal.crownPayoutAtomicUnits',
	);
	const finalWin = requireSafeNonNegativeInteger(
		crown.finalWinAtomicUnits,
		'kitchenCrownReveal.finalWinAtomicUnits',
	);
	if (
		state.winner === null ||
		crown.winner !== state.winner ||
		crown.bonusBankAtomicUnits !== state.bonusBankAtomicUnits ||
		crown.crownPotAtomicUnits !== state.crownPotAtomicUnits ||
		crownPayout !== state.crownPotAtomicUnits * crown.multiplier ||
		finalWin !== state.bonusBankAtomicUnits + crownPayout
	)
		validationError('Kitchen Crown final payout must equal Bank plus Pot times multiplier');
	cursor++;
	if (finalWin === maxWinAtomicUnits) {
		const maxEvent = events[cursor];
		if (!maxEvent || maxEvent.type !== 'maxWinReached')
			validationError(
				'exact Crown cap requires maxWinReached immediately after kitchenCrownReveal',
			);
		validateKnownPayload(maxEvent);
		if (maxEvent.maxWinAtomicUnits !== maxWinAtomicUnits)
			validationError('maxWinReached must announce the exact round cap');
		cursor++;
	} else if (events[cursor]?.type === 'maxWinReached')
		validationError('maxWinReached requires the exact cap');
	const total = events[cursor];
	const final = events[cursor + 1];
	if (
		!total ||
		total.type !== 'setTotalWin' ||
		!final ||
		final.type !== 'finalWin' ||
		cursor + 2 !== events.length
	)
		validationError(
			'Kitchen Crown must be followed only by maxWinReached? → setTotalWin → finalWin',
		);
	if (total.totalWinAtomicUnits !== finalWin || final.payoutAtomicUnits !== finalWin)
		validationError('Showdown terminal payout');
	validateTotalPayout(finalWin, maxWinAtomicUnits);
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
	let maxSeen = false;

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
		if (maxSeen && event.type !== 'setTotalWin' && event.type !== 'finalWin')
			validationError('event after maxWinReached must be setTotalWin or finalWin');
		if (event.type === 'maxWinReached') maxSeen = true;
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
	const hasShowdown =
		roundStart.mode === 'kitchenShowdown' ||
		roundStart.mode === 'grandShowdown' ||
		roundStart.mode === 'mysteryTasting' ||
		events.some(
			(event) => event.type === 'kitchenShowdownTriggered' || event.type === 'kitchenShowdownStart',
		);
	const finalWinAtomicUnits = hasShowdown
		? validateShowdownLifecycle(events)
		: validateBaseLifecycle(events);
	const maxWinAtomicUnits = requireSafeNonNegativeInteger(
		roundStart.maxWinAtomicUnits,
		'roundStart.maxWinAtomicUnits',
	);
	validateTotalPayout(finalWinAtomicUnits, maxWinAtomicUnits);

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
