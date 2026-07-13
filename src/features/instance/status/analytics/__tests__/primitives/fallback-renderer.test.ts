import { describe, expect, it } from 'vitest';
import { buildFallbackPanels } from '../../primitives/FallbackRenderer';
import type { AnalyticsDataPoint } from '../../types/analytics';

describe('buildFallbackPanels', () => {
	it('drops records lacking a numeric time instead of plotting them at x=0 (1970)', () => {
		const records = [
			{ time: 1_750_000_000_000, node: 'n1', foo: 1 },
			// No `time` — previously mapped to x: 0, dragging the x-domain
			// back to 1970.
			{ node: 'n1', foo: 2 },
			{ time: 1_750_000_060_000, node: 'n1', foo: 3 },
		] as unknown as AnalyticsDataPoint[];

		const { panels } = buildFallbackPanels(records);
		const fooPanel = panels.find((p) => p.title === 'foo');
		expect(fooPanel).toBeTruthy();
		const xs = fooPanel!.data.series[0].points.map((p) => p.x);
		expect(xs).toEqual([1_750_000_000_000, 1_750_000_060_000]);
	});

	it('caps visible panels and reports the overflow count', () => {
		const record: Record<string, unknown> = { time: 1_000, node: 'n1' };
		for (let i = 0; i < 10; i++) { record[`field${i}`] = i; }

		const { panels, overflowCount } = buildFallbackPanels([record as unknown as AnalyticsDataPoint]);
		expect(panels.length).toBe(8);
		expect(overflowCount).toBe(2);
	});
});
