// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { TrafficByTypeRenderer } from '../../primitives/TrafficByTypeRenderer.tsx';
import type { AnalyticsDataPoint, MetricSpec } from '../../types/analytics.ts';

const range = { startTime: 0, endTime: 10_000_000 };

const spec: MetricSpec = {
	title: 'stack-by test',
	description: '',
	tab: 'traffic',
	primaryDimension: 'type',
	series: {
		kind: 'groupBy',
		dimension: 'type',
		field: { field: 'value', label: 'value' },
	},
	timestamp: 'time',
	bucket: { source: 'period-field', fallbackMs: 60000 },
	aggregator: { temporal: 'mean', crossNode: 'sum' },
	primitive: 'stacked-area',
	yAxis: { unit: '', formatter: 'count' },
};

const records: AnalyticsDataPoint[] = (['n1', 'n2'] as const).flatMap((node) =>
	(['mqtt', 'http'] as const).map((type) => ({
		time: 100_000,
		node,
		type,
		value: 5,
		count: 10,
		period: 60_000,
	} as any))
);

function renderToggle() {
	render(
		<TrafficByTypeRenderer
			spec={spec}
			typeField="type"
			records={records}
			timeRange={range}
			nodes={['n1', 'n2']}
			theme="light"
		/>,
	);
	return screen.getAllByTestId('stack-by-button');
}

describe('StackByToggle radiogroup (shared roving-tabindex primitive)', () => {
	afterEach(() => cleanup());

	it('is a single tab stop: only the active option has tabIndex=0', () => {
		const buttons = renderToggle();
		expect(buttons.length).toBe(3);
		expect(buttons.map((b) => (b as HTMLButtonElement).tabIndex)).toEqual([0, -1, -1]);
		expect(buttons.map((b) => b.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false']);
	});

	it('arrow keys move selection and the tab stop, wrapping at the ends', () => {
		const buttons = renderToggle();
		fireEvent.keyDown(buttons[0], { key: 'ArrowRight' });
		expect(buttons[1].getAttribute('aria-checked')).toBe('true');
		expect(buttons.map((b) => (b as HTMLButtonElement).tabIndex)).toEqual([-1, 0, -1]);
		// Left from the first wraps to the last.
		fireEvent.keyDown(buttons[1], { key: 'ArrowLeft' });
		fireEvent.keyDown(buttons[0], { key: 'ArrowLeft' });
		expect(buttons[2].getAttribute('aria-checked')).toBe('true');
	});

	it('click selects an option', () => {
		const buttons = renderToggle();
		fireEvent.click(buttons[2]);
		expect(buttons[2].getAttribute('aria-checked')).toBe('true');
		expect(buttons.map((b) => (b as HTMLButtonElement).tabIndex)).toEqual([-1, -1, 0]);
	});
});
