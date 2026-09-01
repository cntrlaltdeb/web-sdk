import P300 from '../books/production/P3-00.json';
import P301 from '../books/production/P3-01.json';
import P302 from '../books/production/P3-02.json';
import P303 from '../books/production/P3-03.json';
import P304 from '../books/production/P3-04.json';
import P305 from '../books/production/P3-05.json';
import P306 from '../books/production/P3-06.json';
import P307 from '../books/production/P3-07.json';
import P308 from '../books/production/P3-08.json';
import P309 from '../books/production/P3-09.json';
import P310 from '../books/production/P3-10.json';
import P311 from '../books/production/P3-11.json';
import P312 from '../books/production/P3-12.json';
import P312Checkpoint from '../books/production/checkpoints/P3-12-e0040.json';
import { assertValidatedProductionBook, validateProductionBook } from './bookValidator';
import { playProductionBookEvent } from './bookEventHandlerMap';
import { prepareProductionBook } from './checkpoint';
import { playPreparedProductionBook } from './playback';
import type {
	PreparedProductionBook,
	ProductionScenarioId,
	ReplayCheckpoint,
	ValidatedProductionBook,
} from './typesBookEvent';

const staticBooks: Record<ProductionScenarioId, unknown> = {
	'P3-00': P300,
	'P3-01': P301,
	'P3-02': P302,
	'P3-03': P303,
	'P3-04': P304,
	'P3-05': P305,
	'P3-06': P306,
	'P3-07': P307,
	'P3-08': P308,
	'P3-09': P309,
	'P3-10': P310,
	'P3-11': P311,
	'P3-12': P312,
};

export async function loadProductionBook(
	scenarioId: ProductionScenarioId,
): Promise<ValidatedProductionBook> {
	return validateProductionBook(staticBooks[scenarioId]);
}

export async function loadPreparedProductionBook(
	scenarioId: ProductionScenarioId,
): Promise<PreparedProductionBook> {
	return prepareProductionBook(staticBooks[scenarioId]);
}

export function loadProductionCheckpoint(
	scenarioId: ProductionScenarioId,
): ReplayCheckpoint | null {
	return scenarioId === 'P3-12' ? (structuredClone(P312Checkpoint) as ReplayCheckpoint) : null;
}

export async function playValidatedProductionBook(book: ValidatedProductionBook): Promise<void> {
	assertValidatedProductionBook(book);
	const prepared = await prepareProductionBook(book.events);
	await playPreparedProductionBook(prepared, 'instant');
}

export async function playValidatedPrefixForTest(
	book: ValidatedProductionBook,
	endExclusive: number,
): Promise<void> {
	assertValidatedProductionBook(book);
	for (const event of book.events.slice(0, endExclusive)) await playProductionBookEvent(event);
}

export async function playProductionBook(value: unknown): Promise<void> {
	const prepared = await prepareProductionBook(value);
	await playPreparedProductionBook(prepared, 'instant');
}
