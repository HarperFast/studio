// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { StackedAreaChart, StackedAreaTooltip } from '../../primitives/StackedAreaChart.tsx';
import type { SeriesData } from '../../types/analytics.ts';

const stacked: SeriesData = {
	series: [
		{ key: 'a', label: 'A', points: [{ x: 1, y: 10 }, { x: 2, y: 15 }] },
		{ key: 'b', label: 'B', points: [{ x: 1, y: 5 }, { x: 2, y: 8 }] },
		{ key: 'c', label: 'C', points: [{ x: 1, y: 2 }, { x: 2, y: 3 }] },
	],
};

// TODO: the it.skip() cases below are Recharts visual-rendering assertions
// that depend on real layout (computed width/height, stroke geometry, axis
// tick text). Both jsdom and happy-dom fall short here even with the
// getBoundingClientRect / ResizeObserver shim in __tests__/setup.ts. Math is
// covered by the pipeline + aggregator suites; revisit these visual checks
// with a Playwright smoke pass once studio adopts E2E.
describe('StackedAreaChart primitive', () => {
	afterEach(() => cleanup());

	it('exposes role=img with composed aria-label', () => {
		render(<StackedAreaChart data={stacked} theme="light" />);
		const img = screen.getByRole('img');
		expect(img.getAttribute('aria-label') ?? '').toMatch(/Stacked area chart with 3 series/);
	});

	it('empty-state uses role=status for live-region announcement', () => {
		render(<StackedAreaChart data={{ series: [] }} theme="light" />);
		const status = screen.getByRole('status');
		expect(status.textContent ?? '').toMatch(/no data in window/i);
	});

	it.skip('mounts an svg container', async () => {
		render(<StackedAreaChart data={stacked} theme="light" />);
		await waitFor(() => {
			const svg = document.querySelector('.recharts-wrapper svg');
			expect(svg, 'Recharts svg rendered').toBeTruthy();
		});
	});
	it.skip('renders three area layers', async () => {
		render(<StackedAreaChart data={stacked} theme="light" />);
		await waitFor(() => {
			const areas = document.querySelectorAll('.recharts-area');
			expect(areas.length).toBe(3);
		});
	});
	it('renders empty-state when series is empty', () => {
		render(<StackedAreaChart data={{ series: [] }} theme="light" />);
		expect(screen.getByText(/no data in window/i)).toBeTruthy();
	});
	it.skip('honors per-series color on the rendered area', async () => {
		const data: SeriesData = {
			series: [
				{ key: 'a', label: 'A', color: '#ff00ff', points: [{ x: 1, y: 10 }, { x: 2, y: 20 }] },
			],
		};
		const { container } = render(<StackedAreaChart data={data} theme="light" />);
		await waitFor(() => {
			const area = container.querySelector('.recharts-area-area');
			expect(area, 'area path rendered').toBeTruthy();
			const fill = area!.getAttribute('fill') ?? '';
			expect(fill.toLowerCase()).toBe('#ff00ff');
		});
	});
	it.skip('appends unit suffix to Y-axis tick labels', async () => {
		const data: SeriesData = { series: [{ key: 'a', label: 'A', points: [{ x: 0, y: 1024 * 1024 }] }] };
		const { container } = render(
			<StackedAreaChart data={data} theme="light" yAxis={{ unit: '/s', formatter: 'bytes-si' }} />,
		);
		await waitFor(() => {
			const tickEls = container.querySelectorAll('.recharts-cartesian-axis-tick-value, .recharts-yAxis text');
			const labels = Array.from(tickEls).map((t) => t.textContent ?? '');
			expect(
				labels.some((l) => l.endsWith('/s')),
				`Expected at least one tick to end with '/s'; got: ${JSON.stringify(labels)}`,
			).toBeTruthy();
		});
	});
	it.skip('renders a ceiling line distinct from area overlays', async () => {
		const withCeiling: SeriesData = {
			...stacked,
			ceiling: { key: 'cap', label: 'Max', points: [{ x: 1, y: 100 }, { x: 2, y: 100 }] },
		};
		const { container } = render(<StackedAreaChart data={withCeiling} theme="light" />);
		await waitFor(() => {
			// Without ceiling, StackedAreaChart renders N area paths. With ceiling,
			// there should be at least one additional `.recharts-line`.
			const ceilingLines = container.querySelectorAll('.recharts-line');
			expect(ceilingLines.length >= 1, 'at least one line (the ceiling) rendered alongside the areas').toBeTruthy();
			// More specifically: the ceiling series is rendered as a Line with its
			// label in the legend.
			expect(container.textContent?.includes('Max'), 'ceiling label appears in legend').toBeTruthy();
		});
	});
});

// TODO: the it.skip() cases below are Recharts visual-rendering assertions
// that depend on real layout (computed width/height, stroke geometry, axis
// tick text). Both jsdom and happy-dom fall short here even with the
// getBoundingClientRect / ResizeObserver shim in __tests__/setup.ts. Math is
// covered by the pipeline + aggregator suites; revisit these visual checks
// with a Playwright smoke pass once studio adopts E2E.
describe('StackedAreaChart Step 3.5 polish', () => {
	afterEach(() => cleanup());

	it.skip('renders <Area> with fillOpacity 0.35 in light theme', async () => {
		const data: SeriesData = {
			series: [
				{ key: 'a', label: 'A', points: [{ x: 0, y: 10 }, { x: 1, y: 12 }] },
				{ key: 'b', label: 'B', points: [{ x: 0, y: 20 }, { x: 1, y: 22 }] },
			],
		};
		const { container } = render(<StackedAreaChart data={data} theme="light" />);
		await waitFor(() => {
			const areas = Array.from(container.querySelectorAll<SVGPathElement>('.recharts-area-area, path'));
			const opacities = areas.map((p) => p.getAttribute('fill-opacity') ?? p.style.fillOpacity ?? '');
			expect(opacities.some((o) => o === '0.35' || o === '.35'), `expected 0.35; got ${JSON.stringify(opacities)}`)
				.toBeTruthy();
		});
	});

	it.skip('renders <Area> with fillOpacity 0.5 in dark theme', async () => {
		const data: SeriesData = { series: [{ key: 'a', label: 'A', points: [{ x: 0, y: 10 }, { x: 1, y: 12 }] }] };
		const { container } = render(<StackedAreaChart data={data} theme="dark" />);
		await waitFor(() => {
			const areas = Array.from(container.querySelectorAll<SVGPathElement>('.recharts-area-area, path'));
			const opacities = areas.map((p) => p.getAttribute('fill-opacity') ?? p.style.fillOpacity ?? '');
			expect(opacities.some((o) => o === '0.5' || o === '.5'), `expected 0.5; got ${JSON.stringify(opacities)}`)
				.toBeTruthy();
		});
	});
});

// TODO: the it.skip() cases below are Recharts visual-rendering assertions
// that depend on real layout (computed width/height, stroke geometry, axis
// tick text). Both jsdom and happy-dom fall short here even with the
// getBoundingClientRect / ResizeObserver shim in __tests__/setup.ts. Math is
// covered by the pipeline + aggregator suites; revisit these visual checks
// with a Playwright smoke pass once studio adopts E2E.
describe('StackedAreaTooltip', () => {
	afterEach(() => cleanup());

	it('renders Total row summing payload values', () => {
		const payload = [
			{ dataKey: 'a', name: 'A', value: 20, color: '#f00' },
			{ dataKey: 'b', name: 'B', value: 15, color: '#0f0' },
		];
		render(<StackedAreaTooltip active payload={payload} label={1700000000000} formatter="count" />);
		expect(screen.getByText(/Total/)).toBeTruthy();
		expect(screen.getByText(/35/)).toBeTruthy();
	});

	it('suppresses Total row for single-series payload', () => {
		const payload = [{ dataKey: 'a', name: 'A', value: 42, color: '#f00' }];
		render(<StackedAreaTooltip active payload={payload} label={1700000000000} formatter="count" />);
		expect(screen.queryByText(/Total/)).toBe(null);
	});

	it('uses raw count formatter for Total on count-si axis (preserve precision)', () => {
		const payload = [
			{ dataKey: 'a', name: 'A', value: 12345, color: '#f00' },
			{ dataKey: 'b', name: 'B', value: 67890, color: '#0f0' },
		];
		render(
			<StackedAreaTooltip active payload={payload} label={1700000000000} formatter="count-si" unitSuffix=" msg/s" />,
		);
		// Total = 80235; rendered raw not "80k".
		expect(screen.getByText(/80235\s*msg\/s/)).toBeTruthy();
	});

	it('returns null when inactive', () => {
		const { container } = render(<StackedAreaTooltip active={false} />);
		expect(container.firstChild).toBe(null);
	});
});
