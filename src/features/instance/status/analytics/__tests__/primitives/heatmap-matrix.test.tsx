// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { HeatmapMatrix } from '../../primitives/HeatmapMatrix.tsx';
import type { HeatmapData } from '../../types/analytics.ts';

const data: HeatmapData = {
	rows: ['src-1', 'src-2'],
	cols: ['dest-a', 'dest-b', 'dest-c'],
	cells: [
		{ row: 'src-1', col: 'dest-a', value: 30, count: 500 },
		{ row: 'src-1', col: 'dest-b', value: 60, count: 300 },
		{ row: 'src-1', col: 'dest-c', value: null, count: 0 },
		{ row: 'src-2', col: 'dest-a', value: 45, count: 80 }, // grey (40 ≤ count < 100)
		{ row: 'src-2', col: 'dest-b', value: 55, count: 20 }, // suppress (count < 40)
		{ row: 'src-2', col: 'dest-c', value: 70, count: 250 },
	],
	axis: { unit: 'ms', formatter: 'ms' },
	confidence: { greyBelow: 40, suppressBelow: 100 },
	rowAxisLabel: 'Source',
	colAxisLabel: 'Destination',
	skippedRecordsCount: 0,
	approx: true,
};

describe('HeatmapMatrix primitive', () => {
	afterEach(() => cleanup());
	it('renders a grid with one row per data row', () => {
		render(<HeatmapMatrix data={data} theme="light" />);
		const grid = screen.getByRole('grid');
		expect(grid).toBeTruthy();
		// 2 data rows + 1 header row
		const rows = screen.getAllByRole('row');
		expect(rows.length).toBe(3);
	});

	it('includes "(approx)" and "p95" in cell aria-labels when approx flag is set', () => {
		render(<HeatmapMatrix data={data} theme="light" />);
		const cells = screen.getAllByRole('gridcell');
		const okCell = cells.find((c) => /src-1.*dest-a|30/.test(c.getAttribute('aria-label') ?? ''))!;
		expect(okCell).toBeTruthy();
		const label = okCell.getAttribute('aria-label') ?? '';
		expect(label).toMatch(/p95/i);
		expect(label).toMatch(/\(approx\)/i);
	});

	it('absent cells announce "no data"', () => {
		render(<HeatmapMatrix data={data} theme="light" />);
		const cell = screen.getAllByRole('gridcell').find((c) => (c.getAttribute('aria-label') ?? '').includes('no data'));
		expect(cell).toBeTruthy();
	});

	it('suppresses cells below suppressBelow as data-confidence="suppress"', () => {
		render(<HeatmapMatrix data={data} theme="light" />);
		const cells = screen.getAllByRole('gridcell');
		const suppressed = cells.filter((c) => c.getAttribute('data-confidence') === 'suppress');
		expect(suppressed.length >= 1).toBeTruthy();
	});

	it('greys cells where greyBelow ≤ count < suppressBelow', () => {
		render(<HeatmapMatrix data={data} theme="light" />);
		const cells = screen.getAllByRole('gridcell');
		const grey = cells.filter((c) => c.getAttribute('data-confidence') === 'grey');
		expect(grey.length >= 1).toBeTruthy();
	});

	it('renders rowheader + columnheader cells', () => {
		render(<HeatmapMatrix data={data} theme="light" />);
		expect(screen.getByRole('rowheader', { name: /src-1/i })).toBeTruthy();
		expect(screen.getByRole('columnheader', { name: /dest-a/i })).toBeTruthy();
	});

	it('renders a color-scale legend', () => {
		render(<HeatmapMatrix data={data} theme="light" />);
		const legend = screen.getByRole('img', { name: /color scale|p95 latency/i });
		expect(legend).toBeTruthy();
	});

	it('ArrowRight moves focus one column right and preventDefaults', () => {
		render(<HeatmapMatrix data={data} theme="light" />);
		const cells = screen.getAllByRole('gridcell');
		// Find src-1 → dest-a
		const first = cells.find((c) =>
			/src-1/.test(c.getAttribute('aria-label') ?? '') && /dest-a/.test(c.getAttribute('aria-label') ?? '')
		);
		expect(first).toBeTruthy();
		(first as HTMLElement).focus();
		const defaultPrevented = !fireEvent.keyDown(first!, { key: 'ArrowRight' });
		expect(defaultPrevented, 'ArrowRight preventDefaulted').toBe(true);
		const second = cells.find((c) =>
			/src-1/.test(c.getAttribute('aria-label') ?? '') && /dest-b/.test(c.getAttribute('aria-label') ?? '')
		);
		expect(document.activeElement).toBe(second);
	});

	it('ArrowRight on rightmost cell is a no-op (no wrap)', () => {
		render(<HeatmapMatrix data={data} theme="light" />);
		const cells = screen.getAllByRole('gridcell');
		const last = cells.find((c) =>
			/src-1/.test(c.getAttribute('aria-label') ?? '') && /dest-c/.test(c.getAttribute('aria-label') ?? '')
		);
		expect(last).toBeTruthy();
		(last as HTMLElement).focus();
		fireEvent.keyDown(last!, { key: 'ArrowRight' });
		expect(document.activeElement, 'focus stays on rightmost cell').toBe(last);
	});

	it('Home/End jump to row start/end', () => {
		render(<HeatmapMatrix data={data} theme="light" />);
		const cells = screen.getAllByRole('gridcell');
		const mid = cells.find((c) =>
			/src-1/.test(c.getAttribute('aria-label') ?? '') && /dest-b/.test(c.getAttribute('aria-label') ?? '')
		);
		(mid as HTMLElement).focus();
		fireEvent.keyDown(mid!, { key: 'End' });
		const end = cells.find((c) =>
			/src-1/.test(c.getAttribute('aria-label') ?? '') && /dest-c/.test(c.getAttribute('aria-label') ?? '')
		);
		expect(document.activeElement).toBe(end);
	});

	it('omits "(approx)" from description when data.approx is false', () => {
		render(<HeatmapMatrix data={{ ...data, approx: false }} theme="light" />);
		const desc = screen.getByTestId('heatmap-desc');
		expect(desc.textContent ?? '').not.toMatch(/\(approx\)/i);
		expect(desc.textContent ?? '').not.toMatch(/count-weighted-mean/i);
	});

	it('omits "(count-weighted-mean, approx)" from color-legend aria-label when data.approx is false', () => {
		render(<HeatmapMatrix data={{ ...data, approx: false }} theme="light" />);
		const legend = screen.getByRole('img', { name: /p95 latency/i });
		expect(legend.getAttribute('aria-label') ?? '').not.toMatch(/count-weighted-mean.*approx/i);
	});

	it('clamps the roving tabindex when the matrix shrinks (regression #1443)', () => {
		const { rerender } = render(<HeatmapMatrix data={data} theme="light" />);
		// Move the active cell to the last row/col via keyboard: End then
		// ArrowDown lands on src-2 → dest-c ([1, 2]).
		const cells = screen.getAllByRole('gridcell');
		const first = cells.find((c) => /src-1.*dest-a/.test(c.getAttribute('aria-label') ?? ''))!;
		expect(first).toBeTruthy();
		(first as HTMLElement).focus();
		fireEvent.keyDown(first, { key: 'End' });
		const rowEnd = cells.find((c) => /src-1.*dest-c/.test(c.getAttribute('aria-label') ?? ''))!;
		fireEvent.keyDown(rowEnd, { key: 'ArrowDown' });
		const corner = cells.find((c) => /src-2.*dest-c/.test(c.getAttribute('aria-label') ?? ''))!;
		expect(corner.getAttribute('tabindex')).toBe('0');

		// Shrink to a 1×2 matrix — the stored active cell [1, 2] is now out of range.
		const shrunk: HeatmapData = {
			...data,
			rows: ['src-1'],
			cols: ['dest-a', 'dest-b'],
			cells: [
				{ row: 'src-1', col: 'dest-a', value: 30, count: 500 },
				{ row: 'src-1', col: 'dest-b', value: 60, count: 300 },
			],
		};
		rerender(<HeatmapMatrix data={shrunk} theme="light" />);

		const shrunkCells = screen.getAllByRole('gridcell');
		expect(shrunkCells.length).toBe(2);
		const tabbable = shrunkCells.filter((c) => c.getAttribute('tabindex') === '0');
		expect(tabbable.length, 'exactly one gridcell keeps tabIndex=0').toBe(1);
		// Clamped to the last row/col that still exists: src-1 → dest-b.
		expect(tabbable[0].getAttribute('aria-label')).toMatch(/src-1.*dest-b/);

		// Keyboard nav still works from the clamped cell.
		(tabbable[0] as HTMLElement).focus();
		fireEvent.keyDown(tabbable[0], { key: 'ArrowLeft' });
		const shrunkFirst = shrunkCells.find((c) => /src-1.*dest-a/.test(c.getAttribute('aria-label') ?? ''));
		expect(document.activeElement).toBe(shrunkFirst);
	});

	it('exposes data-cell-size attribute as a number on the SVG root', () => {
		const { container } = render(<HeatmapMatrix data={data} theme="light" />);
		const svg = container.querySelector('svg[role="grid"]');
		const cellSize = Number(svg?.getAttribute('data-cell-size'));
		expect(Number.isFinite(cellSize) && cellSize >= 40 && cellSize <= 80).toBeTruthy();
	});
});
