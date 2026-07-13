// @vitest-environment happy-dom
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SmallMultiples } from '../../primitives/SmallMultiples.tsx';
import type { AxisSpec, SeriesData } from '../../types/analytics.ts';

const panels: { title: string; data: SeriesData; yAxis?: AxisSpec | { left: AxisSpec; right?: AxisSpec } }[] = [
	{ title: 'CPU', data: { series: [{ key: 'cpu', label: 'cpu', points: [{ x: 1, y: 10 }] }] } },
	{ title: 'Disk', data: { series: [{ key: 'disk', label: 'disk', points: [{ x: 1, y: 20 }] }] } },
	{ title: 'Net', data: { series: [{ key: 'net', label: 'net', points: [{ x: 1, y: 30 }] }] } },
];

// TODO: the it.skip() cases below are Recharts visual-rendering assertions
// that depend on real layout (computed width/height, stroke geometry, axis
// tick text). Both jsdom and happy-dom fall short here even with the
// getBoundingClientRect / ResizeObserver shim in __tests__/setup.ts. Math is
// covered by the pipeline + aggregator suites; revisit these visual checks
// with a Playwright smoke pass once studio adopts E2E.
describe('SmallMultiples primitive', () => {
	afterEach(() => cleanup());

	it('renders one mini-panel per input entry', () => {
		render(<SmallMultiples panels={panels} />);
		const headings = document.querySelectorAll('[data-testid="small-multiple-title"]');
		expect(headings.length).toBe(3);
	});
	it('includes each panel title', () => {
		const { container } = render(<SmallMultiples panels={panels} />);
		expect(
			container.querySelector('[data-testid="small-multiple-title"]:first-child')
				|| container.textContent?.includes('CPU'),
		).toBeTruthy();
		expect(container.textContent?.includes('Disk')).toBeTruthy();
		expect(container.textContent?.includes('Net')).toBeTruthy();
	});

	it.skip('passes per-panel yAxis through to the inner LineChart (tick suffix)', async () => {
		const perAxisPanels: { title: string; data: SeriesData; yAxis?: AxisSpec }[] = [
			{
				title: 'Throughput',
				data: { series: [{ key: 'tp', label: 'tp', points: [{ x: 0, y: 50 }, { x: 1, y: 100 }] }] },
				yAxis: { unit: '/s', formatter: 'count' },
			},
		];
		const { container } = render(<SmallMultiples panels={perAxisPanels} />);
		await waitFor(() => {
			const tickEls = container.querySelectorAll('.recharts-cartesian-axis-tick-value, .recharts-yAxis text');
			const labels = Array.from(tickEls).map((t) => t.textContent ?? '');
			expect(
				labels.some((l) => l.endsWith('/s')),
				`expected at least one tick to end with '/s'; got: ${JSON.stringify(labels)}`,
			).toBeTruthy();
		});
	});
});
