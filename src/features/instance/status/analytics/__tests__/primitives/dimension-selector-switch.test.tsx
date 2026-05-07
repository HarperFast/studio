// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DimensionSelectorRenderer } from '../../primitives/DimensionSelectorRenderer.tsx';
import type { AnalyticsDataPoint, MetricSpec } from '../../types/analytics.ts';

const range = { startTime: 0, endTime: 10_000_000 };

function specForN(_n: number): MetricSpec {
	return {
		title: 'switch test',
		description: '',
		tab: 'requests',
		primaryDimension: 'path',
		series: {
			kind: 'groupBy',
			dimension: 'path',
			field: { field: 'value', label: 'value' },
			// no topN so all dimension values flow through.
		},
		timestamp: 'time',
		bucket: { source: 'period-field', fallbackMs: 60000 },
		aggregator: { temporal: 'mean', crossNode: 'mean' },
		primitive: 'line',
		yAxis: { unit: '', formatter: 'count' },
	};
}

function recordsForN(n: number): AnalyticsDataPoint[] {
	return Array.from({ length: n }, (_, i) => ({
		time: 100_000,
		node: 'n1',
		path: `p${String(i).padStart(2, '0')}`,
		value: i + 1,
		count: 100,
		period: 60_000,
	} as any));
}

describe('DimensionSelectorRenderer chip↔combobox auto-switch', () => {
	afterEach(() => cleanup());

	it('renders chip row at exactly 12 selectable values (boundary, ≤12)', async () => {
		const spec = specForN(12);
		render(
			<DimensionSelectorRenderer
				spec={spec}
				records={recordsForN(12)}
				timeRange={range}
				nodes={['n1']}
				theme="light"
			/>,
		);
		const chips = await screen.findAllByRole('radio');
		expect(chips.length).toBe(12);
		expect(screen.queryByRole('combobox')).toBe(null);
	});

	it('switches to combobox at 13 selectable values (>12)', async () => {
		const spec = specForN(13);
		render(
			<DimensionSelectorRenderer
				spec={spec}
				records={recordsForN(13)}
				timeRange={range}
				nodes={['n1']}
				theme="light"
			/>,
		);
		// DimensionCombobox uses APG button-pattern: trigger is a button with
		// aria-haspopup='listbox', not role='combobox'. The role='combobox' is
		// the searchbox INSIDE the popup, only present while open.
		const trigger = await screen.findByRole('button', { name: 'Dimension' });
		expect(trigger.getAttribute('aria-haspopup')).toBe('listbox');
		expect(screen.queryAllByRole('radio').length).toBe(0);
	});
});
