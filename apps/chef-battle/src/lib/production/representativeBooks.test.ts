import { cleanup, render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import manifest from '../books/production/stage4/manifest.json';
import { canonicalProductionJson } from './checkpoint';
import ProductionRound from './components/ProductionRound.svelte';
import { loadPreparedProductionBook, loadProductionCheckpoint } from './localBookAdapter';
import { playPreparedProductionBook, resumeProductionBook } from './playback';
import { productionState, resetProductionState } from './stateGame.svelte';
import { PRODUCTION_SCENARIO_IDS } from './typesBookEvent';
import type { PlaybackSpeed } from './typesBookEvent';

const EXPECTED_STAGE4_IDS = Array.from(
	{ length: 18 },
	(_, index) => `S4-${String(index).padStart(2, '0')}`,
);
const SPEEDS = ['normal', 'fast', 'instant'] as const satisfies readonly PlaybackSpeed[];
const LOW_RETURN_IDS = ['S4-00', 'S4-01', 'S4-02', 'S4-05', 'S4-06'] as const;
const STAGE4_IDS = Object.keys(manifest.books) as Array<keyof typeof manifest.books>;

function observeCelebrations(container: HTMLElement): () => string[] {
	const seen: string[] = [];
	const pattern = /win-celebration|confetti|big win|mega win|congratulations|you win/i;
	const inspectText = (text: string | null) => {
		if (text && pattern.test(text)) seen.push(text);
	};
	const inspectNode = (node: Node) => {
		inspectText(node instanceof Element ? node.outerHTML : node.textContent);
	};
	const collect = (records: MutationRecord[]) => {
		for (const record of records) {
			inspectNode(record.target);
			inspectText(record.oldValue);
			for (const node of record.addedNodes) inspectNode(node);
			for (const node of record.removedNodes) inspectNode(node);
		}
	};
	const observer = new MutationObserver(collect);
	observer.observe(container, {
		subtree: true,
		childList: true,
		attributes: true,
		attributeOldValue: true,
		characterData: true,
		characterDataOldValue: true,
	});
	inspectNode(container);
	return () => {
		collect(observer.takeRecords());
		observer.disconnect();
		return seen;
	};
}

describe('accepted Stage 4 representative Books', () => {
	beforeEach(resetProductionState);
	afterEach(cleanup);

	it('registers all 18 representatives while retaining the 13 P3 scenarios', () => {
		expect(PRODUCTION_SCENARIO_IDS.filter((id) => id.startsWith('S4-'))).toEqual(
			EXPECTED_STAGE4_IDS,
		);
		expect(PRODUCTION_SCENARIO_IDS.filter((id) => id.startsWith('P3-'))).toHaveLength(13);
	});

	it('uses exactly the accepted positive-weight release representatives', () => {
		expect(manifest.releaseStatus).toBe('PRODUCTION_SOURCE_VERIFIED');
		expect(STAGE4_IDS).toEqual(EXPECTED_STAGE4_IDS);
		for (const [id, book] of Object.entries(manifest.books)) {
			expect(book.fixture).toBe(`${id}.json`);
			expect(book.lookupWeight).toBeGreaterThan(0);
			expect(Number.isSafeInteger(book.payoutTenths)).toBe(true);
		}
	});

	it.each(STAGE4_IDS)(
		'%s executes all handlers with exact payout and state at every speed',
		async (id) => {
			const prepared = await loadPreparedProductionBook(id);
			const expected = manifest.books[id];
			expect(prepared.events).toHaveLength(expected.eventCount);
			const snapshots = [];
			for (const speed of SPEEDS) {
				await playPreparedProductionBook(prepared, speed);
				expect(productionState.handledSequences).toEqual(
					prepared.events.map((event) => event.sequence),
				);
				expect(productionState.finalWinAtomicUnits).toBe(expected.payoutTenths * 100_000);
				expect(canonicalProductionJson(productionState.replayState)).toBe(
					canonicalProductionJson(prepared.finalState),
				);
				snapshots.push(JSON.parse(JSON.stringify(productionState)));
			}
			expect(snapshots[1]).toEqual(snapshots[0]);
			expect(snapshots[2]).toEqual(snapshots[0]);
		},
		30_000,
	);

	it('provides the exported S4-12 recovery checkpoint', () => {
		const checkpoint = loadProductionCheckpoint('S4-12');
		expect(checkpoint).not.toBeNull();
		expect(checkpoint?.sequence).toBe(manifest.books['S4-12'].checkpointSequence);
	});

	it('replays only the S4-12 suffix and reaches the complete result at every speed', async () => {
		const prepared = await loadPreparedProductionBook('S4-12');
		const checkpoint = loadProductionCheckpoint('S4-12');
		if (!checkpoint) throw new Error('S4-12 checkpoint is required');
		await playPreparedProductionBook(prepared, 'instant');
		const fullState = canonicalProductionJson(productionState.replayState);
		for (const speed of SPEEDS) {
			await resumeProductionBook(prepared, checkpoint, speed);
			expect(productionState.handledSequences).toEqual(
				prepared.events.slice(checkpoint.sequence).map((event) => event.sequence),
			);
			expect(canonicalProductionJson(productionState.replayState)).toBe(fullState);
			expect(productionState.finalWinAtomicUnits).toBe(manifest.books['S4-12'].finalWinAtomicUnits);
		}
	}, 30_000);

	it.each(LOW_RETURN_IDS)(
		'%s renders the exact non-profit return without a win celebration',
		async (id) => {
			const prepared = await loadPreparedProductionBook(id);
			for (const speed of SPEEDS) {
				resetProductionState();
				const { container } = render(ProductionRound);
				const stopObserving = observeCelebrations(container);
				let celebrations: string[];
				try {
					await playPreparedProductionBook(prepared, speed);
					await tick();
				} finally {
					celebrations = stopObserving();
				}
				const payout = productionState.finalWinAtomicUnits;
				const bet = productionState.betAtomicUnits;
				expect(bet).toBe(1_000_000);
				if (id === 'S4-00') expect(payout).toBe(0);
				else if (id === 'S4-02') expect(payout).toBe(bet);
				else {
					expect(payout).toBeGreaterThan(0);
					expect(payout).toBeLessThan(bet);
				}
				expect(
					screen.getByText(`Final win: ${manifest.books[id].payoutTenths * 100_000}`),
				).not.toBeNull();
				expect(celebrations).toEqual([]);
				cleanup();
			}
		},
	);

	it('covers every exported return at or below one bet in the UI assertions', () => {
		expect(STAGE4_IDS.filter((id) => manifest.books[id].payoutTenths <= 10)).toEqual(
			LOW_RETURN_IDS,
		);
	});

	it('detects a celebration inserted and removed before the final DOM assertion', () => {
		const { container } = render(ProductionRound);
		const stopObserving = observeCelebrations(container);
		const canary = document.createElement('div');
		canary.className = 'win-celebration';
		canary.textContent = 'BIG WIN';
		container.append(canary);
		canary.remove();
		expect(container.querySelector('.win-celebration')).toBeNull();
		expect(stopObserving().length).toBeGreaterThan(0);
	});
});
