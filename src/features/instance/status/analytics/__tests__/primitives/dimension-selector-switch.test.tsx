// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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
		// the searchbox INSIDE the popup, only present while open. The trigger's
		// accessible name composes the label with the current selection.
		const trigger = await screen.findByRole('button', { name: /^Dimension: / });
		expect(trigger.getAttribute('aria-haspopup')).toBe('listbox');
		expect(screen.queryAllByRole('radio').length).toBe(0);
	});
});

describe('DimensionSelectorRenderer quantile picker radiogroup', () => {
	afterEach(() => cleanup());

	function quantileSpec(): MetricSpec {
		return {
			...specForN(3),
			quantileSelector: {
				fields: [
					{ field: 'p50', label: 'Median' },
					{ field: 'p95', label: 'p95' },
					{ field: 'p99', label: 'p99' },
				],
				default: 'p95',
			},
		};
	}

	function renderQuantile() {
		render(
			<DimensionSelectorRenderer
				spec={quantileSpec()}
				records={recordsForN(3)}
				timeRange={range}
				nodes={['n1']}
				theme="light"
			/>,
		);
		return screen.getAllByTestId('quantile-button');
	}

	it('is a single tab stop: only the selected quantile has tabIndex=0', () => {
		const buttons = renderQuantile();
		expect(buttons.length).toBe(3);
		expect(buttons.map((b) => (b as HTMLButtonElement).tabIndex)).toEqual([-1, 0, -1]);
		expect(buttons.map((b) => b.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false']);
	});

	it('ArrowRight moves selection (and the tab stop) to the next quantile, wrapping', () => {
		const buttons = renderQuantile();
		// p95 selected → ArrowRight selects p99.
		fireEvent.keyDown(buttons[1], { key: 'ArrowRight' });
		expect(buttons[2].getAttribute('aria-checked')).toBe('true');
		expect(buttons.map((b) => (b as HTMLButtonElement).tabIndex)).toEqual([-1, -1, 0]);
		// ArrowRight from the last wraps to the first.
		fireEvent.keyDown(buttons[2], { key: 'ArrowRight' });
		expect(buttons[0].getAttribute('aria-checked')).toBe('true');
		expect(buttons.map((b) => (b as HTMLButtonElement).tabIndex)).toEqual([0, -1, -1]);
	});

	it('ArrowLeft wraps backwards from the first quantile', () => {
		const buttons = renderQuantile();
		fireEvent.keyDown(buttons[1], { key: 'ArrowLeft' });
		expect(buttons[0].getAttribute('aria-checked')).toBe('true');
		fireEvent.keyDown(buttons[0], { key: 'ArrowLeft' });
		expect(buttons[2].getAttribute('aria-checked')).toBe('true');
	});
});
