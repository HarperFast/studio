import { describe, expect, it } from 'vitest';
import { durationAxisTicks, lineChartDurationAxes, stackedDurationAxis } from '../../primitives/durationAxisTicks';
import type { Series } from '../../types/analytics';

const DAY = 86_400_000;
const lag: Series[] = [{ key: 'a→b', label: 'a→b', points: [{ x: 1, y: 8.3 * DAY }, { x: 2, y: null }] }];

describe('durationAxisTicks', () => {
	it('gives a duration axis round-time ticks up to the largest value', () => {
		expect(durationAxisTicks({ unit: '', formatter: 'ms' }, lag)?.ticks).toEqual(
			[0, 2, 4, 6, 8, 10].map((n) => n * DAY),
		);
	});
	it('reads only the series on the axis', () => {
		const both: Series[] = [...lag, { key: 'q', label: 'q', axis: 'right', points: [{ x: 1, y: 40 * DAY }] }];
		expect(durationAxisTicks({ unit: '', formatter: 'ms' }, both, (s) => s.axis !== 'right')?.ticks.at(-1)).toBe(
			10 * DAY,
		);
		expect(durationAxisTicks({ unit: '', formatter: 'ms' }, both, (s) => s.axis === 'right')?.ticks.at(-1)).toBe(
			42 * DAY,
		);
	});
	it('leaves other axes, explicit domains, log scales and negative values to the chart', () => {
		expect(durationAxisTicks({ unit: '', formatter: 'bytes-si' }, lag)).toBeUndefined();
		expect(durationAxisTicks({ unit: '', formatter: 'ms', domain: [0, 'auto'] }, lag)).toBeUndefined();
		expect(durationAxisTicks({ unit: '', formatter: 'ms', scale: 'log' }, lag)).toBeUndefined();
		expect(durationAxisTicks({ unit: '', formatter: 'ms' }, [{ ...lag[0], points: [{ x: 1, y: -5 }] }]))
			.toBeUndefined();
	});
});

describe('lineChartDurationAxes', () => {
	it('keeps a threshold above the data inside the left axis', () => {
		const data = { series: lag, thresholds: [{ value: 11 * DAY, label: 'SLO', direction: 'above-is-bad' as const }] };
		expect(lineChartDurationAxes({ unit: '', formatter: 'ms' }, data)[0]?.ticks.at(-1)).toBe(14 * DAY);
	});
	it('sizes each side of a dual axis from its own series', () => {
		const data = {
			series: [
				{ key: 'util', label: 'util', axis: 'left' as const, points: [{ x: 1, y: 0.5 }] },
				{ key: 'lag', label: 'lag', axis: 'right' as const, points: [{ x: 1, y: 9_000 }] },
			],
		};
		const [left, right] = lineChartDurationAxes(
			{ left: { unit: '', formatter: 'percent' }, right: { unit: '', formatter: 'ms' } },
			data,
		);
		expect(left).toBeUndefined();
		expect(right?.ticks.map(right.format)).toEqual(['0 s', '2 s', '4 s', '6 s', '8 s', '10 s']);
	});
});

describe('stackedDurationAxis', () => {
	const series: Series[] = [
		{ key: 'a', label: 'a', points: [] },
		{ key: 'b', label: 'b', points: [] },
	];
	it('sizes the axis to the top of the stack', () => {
		const rows = [{ x: 1, a: 3 * DAY, b: 4 * DAY }, { x: 2, a: 1 * DAY, b: null }];
		expect(stackedDurationAxis({ unit: '', formatter: 'ms' }, series, rows)?.ticks.at(-1)).toBe(8 * DAY);
	});
	it('leaves non-duration axes alone', () => {
		expect(stackedDurationAxis({ unit: '/s', formatter: 'count-si' }, series, [{ x: 1, a: 5 }])).toBeUndefined();
	});
});
