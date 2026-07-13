// @vitest-environment happy-dom
// Regression for #1450: a dimension value containing '|' (URL paths can)
// used to be corrupted by renderers splitting the `${dim}|${node}` series
// key at the first '|' — the chip row showed the truncated prefix and the
// node legend/colors keyed off the mangled remainder. The renderer now
// reads the structured Series.dim/Series.node fields.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DimensionSelectorRenderer } from '../../primitives/DimensionSelectorRenderer.tsx';
import type { AnalyticsDataPoint, MetricSpec } from '../../types/analytics.ts';

const range = { startTime: 0, endTime: 10_000_000 };

const PIPE_PATH = '/api|v2/x';

const spec: MetricSpec = {
	title: 'pipe-dim test',
	description: '',
	tab: 'requests',
	primaryDimension: 'path',
	series: {
		kind: 'groupBy',
		dimension: 'path',
		field: { field: 'value', label: 'value' },
	},
	timestamp: 'time',
	bucket: { source: 'period-field', fallbackMs: 60000 },
	aggregator: { temporal: 'mean', crossNode: 'mean' },
	primitive: 'line',
	yAxis: { unit: '', formatter: 'count' },
};

const records: AnalyticsDataPoint[] = (['n1.example.com', 'n2.example.com'] as const).flatMap((node) => [
	{ time: 100_000, node, path: PIPE_PATH, value: 1, count: 100, period: 60_000 } as any,
	{ time: 100_000, node, path: '/plain', value: 2, count: 100, period: 60_000 } as any,
]);

describe('DimensionSelectorRenderer with a dimension value containing "|"', () => {
	afterEach(() => cleanup());

	it('lists the full dimension value as one chip (no split at the pipe)', async () => {
		render(
			<DimensionSelectorRenderer
				spec={spec}
				records={records}
				timeRange={range}
				nodes={['n1.example.com', 'n2.example.com']}
				theme="light"
			/>,
		);
		const chips = await screen.findAllByRole('radio');
		const labels = chips.map((c) => c.textContent);
		// Exactly the two real paths — no truncated '/api' chip, no phantom
		// 'v2/x|…' entries.
		expect(labels.sort()).toEqual(['/api|v2/x', '/plain']);
	});

	it('selecting the pipe-dim chip keeps one cleanly-labeled line per node', async () => {
		render(
			<DimensionSelectorRenderer
				spec={spec}
				records={records}
				timeRange={range}
				nodes={['n1.example.com', 'n2.example.com']}
				theme="light"
			/>,
		);
		const pipeChip = await screen.findByRole('radio', { name: PIPE_PATH });
		fireEvent.click(pipeChip);
		// The chart's aria-label enumerates the filtered series labels. With
		// the old first-'|' split this came out as one series labeled
		// 'v2/x|n1' — the node id mangled with the dim's tail.
		const chart = await screen.findByRole('img');
		expect(chart.getAttribute('aria-label')).toBe('Chart with 2 series: n1, n2');
	});
});
