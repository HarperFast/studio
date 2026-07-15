// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HeatmapMatrix } from '../../primitives/HeatmapMatrix';
import type { HeatmapData } from '../../types/analytics';

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
		render(<HeatmapMatrix data={data} />);
		const grid = screen.getByRole('grid');
		expect(grid).toBeTruthy();
		// 2 data rows + 1 header row
		const rows = screen.getAllByRole('row');
		expect(rows.length).toBe(3);
	});

	it('includes "(approx)" and "p95" in cell aria-labels when approx flag is set', () => {
		render(<HeatmapMatrix data={data} />);
		const cells = screen.getAllByRole('gridcell');
		const okCell = cells.find((c) => /src-1.*dest-a|30/.test(c.getAttribute('aria-label') ?? ''))!;
		expect(okCell).toBeTruthy();
		const label = okCell.getAttribute('aria-label') ?? '';
		expect(label).toMatch(/p95/i);
		expect(label).toMatch(/\(approx\)/i);
	});

	it('absent cells announce "no data"', () => {
		render(<HeatmapMatrix data={data} />);
		const cell = screen.getAllByRole('gridcell').find((c) => (c.getAttribute('aria-label') ?? '').includes('no data'));
		expect(cell).toBeTruthy();
	});

	it('suppresses cells below suppressBelow as data-confidence="suppress"', () => {
		render(<HeatmapMatrix data={data} />);
		const cells = screen.getAllByRole('gridcell');
		const suppressed = cells.filter((c) => c.getAttribute('data-confidence') === 'suppress');
		expect(suppressed.length >= 1).toBeTruthy();
	});

	it('greys cells where greyBelow ≤ count < suppressBelow', () => {
		render(<HeatmapMatrix data={data} />);
		const cells = screen.getAllByRole('gridcell');
		const grey = cells.filter((c) => c.getAttribute('data-confidence') === 'grey');
		expect(grey.length >= 1).toBeTruthy();
	});

	it('renders rowheader + columnheader cells', () => {
		render(<HeatmapMatrix data={data} />);
		expect(screen.getByRole('rowheader', { name: /src-1/i })).toBeTruthy();
		expect(screen.getByRole('columnheader', { name: /dest-a/i })).toBeTruthy();
	});

	it('renders a color-scale legend', () => {
		render(<HeatmapMatrix data={data} />);
		const legend = screen.getByRole('img', { name: /color scale|p95 latency/i });
		expect(legend).toBeTruthy();
	});

	it('ArrowRight moves focus one column right and preventDefaults', () => {
		render(<HeatmapMatrix data={data} />);
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
		render(<HeatmapMatrix data={data} />);
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
		render(<HeatmapMatrix data={data} />);
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
		render(<HeatmapMatrix data={{ ...data, approx: false }} />);
		const desc = screen.getByTestId('heatmap-desc');
		expect(desc.textContent ?? '').not.toMatch(/\(approx\)/i);
		expect(desc.textContent ?? '').not.toMatch(/count-weighted-mean/i);
	});

	it('omits "(count-weighted-mean, approx)" from color-legend aria-label when data.approx is false', () => {
		render(<HeatmapMatrix data={{ ...data, approx: false }} />);
		const legend = screen.getByRole('img', { name: /p95 latency/i });
		expect(legend.getAttribute('aria-label') ?? '').not.toMatch(/count-weighted-mean.*approx/i);
	});

	it('clamps the roving tabindex when the matrix shrinks (regression #1443)', () => {
		const { rerender } = render(<HeatmapMatrix data={data} />);
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
		rerender(<HeatmapMatrix data={shrunk} />);

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
		const { container } = render(<HeatmapMatrix data={data} />);
		const svg = container.querySelector('svg[role="grid"]');
		const cellSize = Number(svg?.getAttribute('data-cell-size'));
		expect(Number.isFinite(cellSize) && cellSize >= 40 && cellSize <= 80).toBeTruthy();
	});

	it('uses the light color ramp by default and the dark ramp when the app root has .dark', () => {
		// The ramp branches on the resolved app theme (the `.dark` class the
		// ThemeProvider toggles on <html>) — not on a prop or the OS setting.
		const { container, unmount } = render(<HeatmapMatrix data={data} />);
		const lightStops = Array.from(container.querySelectorAll('linearGradient stop'))
			.map((el) => el.getAttribute('stop-color'));
		expect(lightStops[0]).toBe('#fef3c7'); // LIGHT_STOPS ramp start (pale)
		expect(lightStops.at(-1)).toBe('#7f1d1d'); // deep red
		unmount();

		document.documentElement.classList.add('dark');
		try {
			const { container: darkContainer } = render(<HeatmapMatrix data={data} />);
			const darkStops = Array.from(darkContainer.querySelectorAll('linearGradient stop'))
				.map((el) => el.getAttribute('stop-color'));
			expect(darkStops[0]).toBe('#713f12'); // DARK_STOPS ramp start (muted amber)
			expect(darkStops.at(-1)).toBe('#fef3c7'); // cream
		} finally {
			document.documentElement.classList.remove('dark');
		}
	});

	it('re-renders onto the other ramp when .dark is toggled while mounted', async () => {
		const { container } = render(<HeatmapMatrix data={data} />);
		document.documentElement.classList.add('dark');
		try {
			// The MutationObserver → setState round-trip is async; poll for it.
			await waitFor(() => {
				const stops = Array.from(container.querySelectorAll('linearGradient stop'))
					.map((el) => el.getAttribute('stop-color'));
				expect(stops[0]).toBe('#713f12');
			});
		} finally {
			document.documentElement.classList.remove('dark');
		}
	});

	it('confidence-state greys come from --chart-heatmap-* tokens (theme-agnostic markup)', () => {
		render(<HeatmapMatrix data={data} />);
		const absent = screen.getAllByRole('gridcell')
			.find((c) => (c.getAttribute('aria-label') ?? '').includes('no data'))!;
		const rect = absent.querySelector('rect');
		expect(rect?.getAttribute('stroke')).toBe('var(--chart-heatmap-muted-stroke, #9ca3af)');
	});

	describe('cell activation (onCellSelect)', () => {
		const findCell = (re: RegExp) =>
			screen.getAllByRole('gridcell').find((c) => re.test(c.getAttribute('aria-label') ?? ''))!;

		it('click on a data cell fires onCellSelect with (row, col)', () => {
			const onCellSelect = vi.fn();
			render(<HeatmapMatrix data={data} onCellSelect={onCellSelect} />);
			fireEvent.click(findCell(/src-1.*dest-a/));
			expect(onCellSelect).toHaveBeenCalledTimes(1);
			expect(onCellSelect).toHaveBeenCalledWith('src-1', 'dest-a');
		});

		it('click on a grey (low-confidence) cell still fires — grey cells carry data', () => {
			const onCellSelect = vi.fn();
			render(<HeatmapMatrix data={data} onCellSelect={onCellSelect} />);
			const grey = findCell(/src-2.*dest-a/);
			expect(grey.getAttribute('data-confidence')).toBe('grey');
			fireEvent.click(grey);
			expect(onCellSelect).toHaveBeenCalledWith('src-2', 'dest-a');
		});

		it('Enter on the focused cell activates and preventDefaults', () => {
			const onCellSelect = vi.fn();
			render(<HeatmapMatrix data={data} onCellSelect={onCellSelect} />);
			const cell = findCell(/src-1.*dest-b/);
			(cell as HTMLElement).focus();
			const notPrevented = fireEvent.keyDown(cell, { key: 'Enter' });
			expect(notPrevented, 'Enter preventDefaulted').toBe(false);
			expect(onCellSelect).toHaveBeenCalledWith('src-1', 'dest-b');
		});

		it('Space on the focused cell activates', () => {
			const onCellSelect = vi.fn();
			render(<HeatmapMatrix data={data} onCellSelect={onCellSelect} />);
			const cell = findCell(/src-1.*dest-a/);
			(cell as HTMLElement).focus();
			fireEvent.keyDown(cell, { key: ' ' });
			expect(onCellSelect).toHaveBeenCalledWith('src-1', 'dest-a');
		});

		it('suppressed and absent cells are aria-disabled and fire on neither click nor Enter', () => {
			const onCellSelect = vi.fn();
			render(<HeatmapMatrix data={data} onCellSelect={onCellSelect} />);
			const suppressed = findCell(/src-2.*dest-b/);
			const absent = findCell(/src-1.*dest-c/);
			expect(suppressed.getAttribute('data-confidence')).toBe('suppress');
			expect(absent.getAttribute('data-confidence')).toBe('absent');
			for (const cell of [suppressed, absent]) {
				expect(cell.getAttribute('aria-disabled')).toBe('true');
				fireEvent.click(cell);
				(cell as HTMLElement).focus();
				fireEvent.keyDown(cell, { key: 'Enter' });
				fireEvent.keyDown(cell, { key: ' ' });
			}
			expect(onCellSelect).not.toHaveBeenCalled();
		});

		it('data cells are not aria-disabled when a handler is present', () => {
			render(<HeatmapMatrix data={data} onCellSelect={() => {}} />);
			expect(findCell(/src-1.*dest-a/).getAttribute('aria-disabled')).toBeNull();
		});

		it('without onCellSelect no cell is aria-disabled and Enter is inert', () => {
			render(<HeatmapMatrix data={data} />);
			const cells = screen.getAllByRole('gridcell');
			expect(cells.every((c) => c.getAttribute('aria-disabled') === null)).toBe(true);
			const cell = findCell(/src-1.*dest-a/);
			(cell as HTMLElement).focus();
			// Should not throw or preventDefault — nothing to activate.
			const notPrevented = fireEvent.keyDown(cell, { key: 'Enter' });
			expect(notPrevented).toBe(true);
		});

		it('grid description mentions activation only when a handler is present', () => {
			const { unmount } = render(<HeatmapMatrix data={data} onCellSelect={() => {}} />);
			expect(screen.getByTestId('heatmap-desc').textContent ?? '').toMatch(/Enter or Space/);
			unmount();
			render(<HeatmapMatrix data={data} />);
			expect(screen.getByTestId('heatmap-desc').textContent ?? '').not.toMatch(/Enter or Space/);
		});
	});

	it('takes the measure label from data.measureLabel (legend, description, and cell labels)', () => {
		render(<HeatmapMatrix data={{ ...data, approx: false, measureLabel: 'p50 latency' }} />);
		const legend = screen.getByRole('img', { name: /p50 latency/i });
		expect(legend).toBeTruthy();
		const desc = screen.getByTestId('heatmap-desc');
		expect(desc.textContent ?? '').toMatch(/p50 latency/);
		// Populated cells must announce the same quantile as the legend —
		// contradictory copy would misinform screen-reader users.
		const okCell = screen.getAllByRole('gridcell')
			.find((c) => /src-1.*dest-a/.test(c.getAttribute('aria-label') ?? ''))!;
		expect(okCell.getAttribute('aria-label')).toMatch(/p50 latency/);
		expect(okCell.getAttribute('aria-label')).not.toMatch(/p95/);
	});
});
