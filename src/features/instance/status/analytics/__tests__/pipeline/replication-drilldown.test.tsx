// @vitest-environment jsdom
// Drilldown from a replication-heatmap cell into the node-pair time series
// (issue #1455): click / Enter on a data cell opens a dialog titled
// `source → target` with the pair's latency line chart.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ReplicationLatencyRenderer } from '../../pipeline/replication-latency';
import type { AnalyticsDataPoint } from '../../types/analytics';

const NODES = ['node-a', 'node-b'];

function mk(source: string, dest: string, time: number, p95: number): AnalyticsDataPoint {
	return { path: `${source}.db.tbl`, node: dest, time, p95, median: p95 / 2, count: 120, period: 60 };
}

// 2×2 matrix (heatmap branch: rows ≥ 2, cols ≥ 2, cells ≤ 12) with both
// diagonal cells absent (a node never replicates to itself here).
const records: AnalyticsDataPoint[] = [
	mk('node-a', 'node-b', 1_000, 10),
	mk('node-a', 'node-b', 2_000, 12),
	mk('node-b', 'node-a', 1_000, 20),
	mk('node-b', 'node-a', 2_000, 22),
];

function renderIt() {
	return render(
		<ReplicationLatencyRenderer
			records={records}
			nodes={NODES}
			timeRange={{ startTime: 0, endTime: 60_000 }}
		/>,
	);
}

function findCell(re: RegExp) {
	return screen.getAllByRole('gridcell').find((c) => re.test(c.getAttribute('aria-label') ?? ''))!;
}

afterEach(() => cleanup());

describe('replication heatmap cell drilldown', () => {
	it('clicking a data cell opens a dialog titled "source → target"', () => {
		renderIt();
		expect(screen.queryByRole('dialog')).toBeNull();
		fireEvent.click(findCell(/node-a.*node-b/));
		const dialog = screen.getByRole('dialog');
		expect(dialog).toBeTruthy();
		expect(screen.getByRole('heading', { name: 'node-a → node-b' })).toBeTruthy();
	});

	it('the dialog reflects the pair that was clicked', () => {
		renderIt();
		fireEvent.click(findCell(/node-b.*node-a/));
		expect(screen.getByRole('heading', { name: 'node-b → node-a' })).toBeTruthy();
		expect(screen.queryByRole('heading', { name: 'node-a → node-b' })).toBeNull();
	});

	it('Enter on the focused cell opens the dialog (keyboard parity)', () => {
		renderIt();
		const cell = findCell(/node-a.*node-b/);
		(cell as HTMLElement).focus();
		fireEvent.keyDown(cell, { key: 'Enter' });
		expect(screen.getByRole('dialog')).toBeTruthy();
		expect(screen.getByRole('heading', { name: 'node-a → node-b' })).toBeTruthy();
	});

	it('absent cells are aria-disabled and do not open the dialog', () => {
		renderIt();
		const absent = findCell(/node-a.*node-a/);
		expect(absent.getAttribute('data-confidence')).toBe('absent');
		expect(absent.getAttribute('aria-disabled')).toBe('true');
		fireEvent.click(absent);
		(absent as HTMLElement).focus();
		fireEvent.keyDown(absent, { key: 'Enter' });
		expect(screen.queryByRole('dialog')).toBeNull();
	});

	it('dialog description names the currently selected quantile', () => {
		renderIt();
		// Switch quantile to p50 (Harper field `median`) before drilling in.
		const p50 = screen.getAllByTestId('quantile-button').find((b) => b.getAttribute('data-value') === 'median')!;
		fireEvent.click(p50);
		fireEvent.click(findCell(/node-a.*node-b/));
		expect(screen.getByText(/p50 replication latency/i)).toBeTruthy();
	});

	it('a pair whose records all lack a numeric time opens with the empty-chart state', () => {
		// Same 2×2 shape, but every node-a→node-b record has a bogus `time` —
		// the cell still renders (matrix ignores time) yet the pair series is
		// empty, so the dialog must fall through to "No data in window".
		const noTime = [
			{ ...mk('node-a', 'node-b', 0, 10), time: 'bogus' as unknown as number },
			{ ...mk('node-a', 'node-b', 0, 12), time: 'bogus' as unknown as number },
			mk('node-b', 'node-a', 1_000, 20),
		];
		render(
			<ReplicationLatencyRenderer
				records={noTime}
				nodes={NODES}
				timeRange={{ startTime: 0, endTime: 60_000 }}
			/>,
		);
		fireEvent.click(findCell(/node-a.*node-b/));
		const dialog = screen.getByRole('dialog');
		expect(screen.getByRole('heading', { name: 'node-a → node-b' })).toBeTruthy();
		expect(dialog.textContent).toMatch(/No data in window/);
	});

	it('keeps the dialog open and tracking the pair when records refresh', () => {
		const { rerender } = renderIt();
		fireEvent.click(findCell(/node-a.*node-b/));
		expect(screen.getByRole('heading', { name: 'node-a → node-b' })).toBeTruthy();
		// Background poll delivers a new window where the drilled pair has no
		// timestamped records — the dialog stays open and shows the empty state.
		const refreshed = [
			{ ...mk('node-a', 'node-b', 0, 11), time: 'bogus' as unknown as number },
			mk('node-b', 'node-a', 3_000, 24),
		];
		rerender(
			<ReplicationLatencyRenderer
				records={refreshed}
				nodes={NODES}
				timeRange={{ startTime: 0, endTime: 60_000 }}
			/>,
		);
		const dialog = screen.getByRole('dialog');
		expect(screen.getByRole('heading', { name: 'node-a → node-b' })).toBeTruthy();
		expect(dialog.textContent).toMatch(/No data in window/);
	});

	it('stays open when a refresh collapses the matrix into the line-fallback branch', () => {
		const { rerender } = renderIt();
		fireEvent.click(findCell(/node-a.*node-b/));
		expect(screen.getByRole('heading', { name: 'node-a → node-b' })).toBeTruthy();
		// New window has a single source → renderer switches to the line
		// fallback (no heatmap). The open drilldown must not vanish.
		rerender(
			<ReplicationLatencyRenderer
				records={[mk('node-a', 'node-b', 1_000, 10), mk('node-a', 'node-b', 2_000, 12)]}
				nodes={NODES}
				timeRange={{ startTime: 0, endTime: 60_000 }}
			/>,
		);
		expect(screen.getByRole('dialog')).toBeTruthy();
		expect(screen.getByRole('heading', { name: 'node-a → node-b' })).toBeTruthy();
	});

	it('re-applies the confidence gate when a refresh drops the pair below greyBelow', () => {
		const { rerender } = renderIt();
		fireEvent.click(findCell(/node-a.*node-b/));
		expect(screen.getByRole('heading', { name: 'node-a → node-b' })).toBeTruthy();
		// Refresh leaves the drilled pair with 20 samples (< greyBelow 40):
		// the heatmap suppresses that cell, so the open dialog must hide the
		// series too instead of leaking sub-threshold data.
		const refreshed = [
			{ ...mk('node-a', 'node-b', 1_000, 10), count: 20 },
			mk('node-b', 'node-a', 1_000, 20),
			mk('node-b', 'node-a', 2_000, 22),
		];
		rerender(
			<ReplicationLatencyRenderer
				records={refreshed}
				nodes={NODES}
				timeRange={{ startTime: 0, endTime: 60_000 }}
			/>,
		);
		const dialog = screen.getByRole('dialog');
		expect(dialog.textContent).toMatch(/Fewer than 40 samples/);
		expect(dialog.textContent).toMatch(/series hidden/);
	});

	it('closing the dialog (Escape) returns to the heatmap and allows re-drill', () => {
		renderIt();
		fireEvent.click(findCell(/node-a.*node-b/));
		const dialog = screen.getByRole('dialog');
		fireEvent.keyDown(dialog, { key: 'Escape' });
		expect(screen.queryByRole('dialog')).toBeNull();
		// The grid is still there and another pair can be drilled.
		fireEvent.click(findCell(/node-b.*node-a/));
		expect(screen.getByRole('heading', { name: 'node-b → node-a' })).toBeTruthy();
	});
});
