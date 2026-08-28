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

function parseStaticBook(book: unknown): BookEvent[] {
	if (!Array.isArray(book)) throw new Error('Local book must be an event array');
	return book.map((event) => {
		if (
			!event ||
			typeof event !== 'object' ||
			!('type' in event) ||
			typeof event.type !== 'string'
		) {
			throw new Error('Local book contains an invalid BookEvent');
		}
		if (!knownEventTypes.has(event.type as BookEvent['type'])) {
			throw new Error(`Unknown BookEvent type: ${event.type}`);
		}
		return event as BookEvent;
	});
}

export async function loadLocalBook(roundId: VerticalSliceId): Promise<BookEvent[]> {
	return parseStaticBook(staticBooks[roundId]);
}

export async function playLocalBook(roundId: VerticalSliceId): Promise<void> {
	await playBookEvents(await loadLocalBook(roundId));
}
