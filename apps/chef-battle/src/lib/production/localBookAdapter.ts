import P300 from '../books/production/P3-00.json';
import { assertValidatedProductionBook, validateProductionBook } from './bookValidator';
import { playProductionBookEvent } from './bookEventHandlerMap';
import { resetProductionState } from './stateGame.svelte';
import type { ProductionScenarioId, ValidatedProductionBook } from './typesBookEvent';

const staticBooks: Record<ProductionScenarioId, unknown> = { 'P3-00': P300 };

export async function loadProductionBook(
	scenarioId: ProductionScenarioId,
): Promise<ValidatedProductionBook> {
	return validateProductionBook(staticBooks[scenarioId]);
}

export async function playValidatedProductionBook(book: ValidatedProductionBook): Promise<void> {
	assertValidatedProductionBook(book);
	resetProductionState();
	for (const event of book.events) await playProductionBookEvent(event);
}

export async function playValidatedPrefixForTest(
	book: ValidatedProductionBook,
	endExclusive: number,
): Promise<void> {
	assertValidatedProductionBook(book);
	for (const event of book.events.slice(0, endExclusive)) await playProductionBookEvent(event);
}

export async function playProductionBook(value: unknown): Promise<void> {
	const book = validateProductionBook(value);
	await playValidatedProductionBook(book);
}
