// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { LineChart } from '../../primitives/LineChart.tsx';
import type { SeriesData } from '../../types/analytics.ts';

const singleSeries: SeriesData = {
	series: [{ key: 's1', label: 'Series One', points: [{ x: 1, y: 10 }, { x: 2, y: 20 }] }],
};

// TODO: the it.skip() cases below are Recharts visual-rendering assertions
// that depend on real layout (computed width/height, stroke geometry, axis
// tick text). Both jsdom and happy-dom fall short here even with the
// getBoundingClientRect / ResizeObserver shim in __tests__/setup.ts. Math is
// covered by the pipeline + aggregator suites; revisit these visual checks
// with a Playwright smoke pass once studio adopts E2E.
describe('LineChart primitive', () => {
	afterEach(() => cleanup());

	it('renders empty-state when series is empty', () => {
		render(<LineChart data={{ series: [] }} theme="light" />);
		expect(screen.getByText(/no data in window/i)).toBeTruthy();
	});

	it('mounts a Recharts wrapper', () => {
		render(<LineChart data={singleSeries} theme="light" />);
		const container = document.querySelector('.recharts-responsive-container');
		expect(container, 'ResponsiveContainer mounted').toBeTruthy();
	});

	it('exposes role=img with a composed aria-label so screen readers see the chart', () => {
		render(<LineChart data={singleSeries} theme="light" />);
		const img = screen.getByRole('img');
		expect(img.getAttribute('aria-label') ?? '').toMatch(/Series One/);
	});

	it.skip('threshold reference labels include numeric value + direction', async () => {
		const withThreshold: SeriesData = {
			...singleSeries,
			thresholds: [
				{ value: 0.999, label: '99.9% SLO', direction: 'below-is-bad' },
			],
		};
		render(<LineChart data={withThreshold} theme="light" yAxis={{ unit: '', formatter: 'percent' }} />);
		// Recharts renders the label text somewhere in the SVG. Search the
		// whole rendered DOM for a string containing label + direction marker.
		await waitFor(() => {
			const text = document.body.textContent ?? '';
			expect(text).toMatch(/99\.9% SLO/);
			expect(text).toMatch(/↓ bad/);
		});
	});

	it('empty-state uses role=status for live-region announcement', () => {
		render(<LineChart data={{ series: [] }} theme="light" />);
		const status = screen.getByRole('status');
		expect(status.textContent ?? '').toMatch(/no data in window/i);
	});

	it('renders legend entries for each series', async () => {
		const dual: SeriesData = {
			series: [
				{ key: 'util', label: 'utilization', axis: 'left', points: [{ x: 1, y: 0.5 }] },
				{ key: 'lag', label: 'queue lag', axis: 'right', points: [{ x: 1, y: 10 }] },
			],
		};
		render(
			<LineChart
				data={dual}
				theme="light"
				yAxis={{
					left: { unit: '%', formatter: 'percent' },
					right: { unit: 'ms', formatter: 'ms' },
				}}
			/>,
		);
		// Legend renders after ResponsiveContainer receives a size via ResizeObserver.
		await waitFor(() => {
			expect(screen.getByText(/utilization/)).toBeTruthy();
			expect(screen.getByText(/queue lag/)).toBeTruthy();
		});
	});

	it.skip('applies opacity to a series when Series.opacity is set', async () => {
		const data: SeriesData = {
			series: [
				{ key: 'a', label: 'A', points: [{ x: 0, y: 10 }, { x: 1, y: 20 }] },
				{ key: 'b', label: 'B', points: [{ x: 0, y: 15 }, { x: 1, y: 25 }], opacity: 0.55 },
			],
		};
		const { container } = render(<LineChart data={data} theme="light" />);
		// Recharts emits <path class="recharts-line-curve" stroke-opacity="...">
		// after ResponsiveContainer sizes via ResizeObserver. Wait for the dimmed
		// line to assert it carries the explicit opacity.
		await waitFor(() => {
			const dimmed = container.querySelector('path.recharts-line-curve[stroke-opacity="0.55"]');
			expect(dimmed, 'dimmed line series renders with stroke-opacity 0.55').toBeTruthy();
		});
	});

	it('renders a threshold reference line when thresholds are provided', async () => {
		const withThresh: SeriesData = {
			...singleSeries,
			thresholds: [{ value: 15, label: 'max', direction: 'above-is-bad' }],
		};
		render(<LineChart data={withThresh} theme="light" />);
		// Recharts renders ReferenceLine inside the svg after ResponsiveContainer sizes.
		await waitFor(() => {
			const lines = document.querySelectorAll('.recharts-reference-line');
			expect(lines.length >= 1, 'at least one reference line rendered').toBeTruthy();
		});
	});

	it.skip('appends unit suffix to Y-axis tick labels', async () => {
		// Use formatter='count' so the suffix is the only decoration on values.
		const data: SeriesData = { series: [{ key: 'a', label: 'A', points: [{ x: 0, y: 50 }, { x: 1, y: 100 }] }] };
		const { container } = render(<LineChart data={data} theme="light" yAxis={{ unit: '/s', formatter: 'count' }} />);
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
