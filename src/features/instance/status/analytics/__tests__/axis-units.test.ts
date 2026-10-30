import { describe, expect, it } from 'vitest';
import { derivedRegistry } from '../pipeline/derived/index';
import { specRegistry } from '../pipeline/index';
import { aggregateReplicationMatrix } from '../pipeline/replication-latency';
import type { AxisSpec, MetricSpec } from '../types/analytics';

/** The unit each formatter already prints; a spec's `unit` may add a modifier
 *  like '/s' but must not print it again ("120 MB B"). */
const FORMATTER_UNIT: Partial<Record<NonNullable<AxisSpec['formatter']>, RegExp>> = {
	'bytes-si': /^\s*[KMGTP]?B\b/,
	'bytes-iec': /^\s*[KMGTP]?i?B\b/,
	'ms': /^\s*(µs|ms|s|min|h|d|yr)\b/,
	'percent': /^\s*%/,
	'cores': /^\s*cores?\b/,
};

function axesOf(name: string, yAxis: MetricSpec['yAxis'], series?: MetricSpec['series']): [string, AxisSpec][] {
	const axes: [string, AxisSpec][] = 'left' in yAxis
		? [[`${name} (left)`, yAxis.left], ...(yAxis.right ? [[`${name} (right)`, yAxis.right] as [string, AxisSpec]] : [])]
		: [[name, yAxis]];
	if (series?.kind === 'field') {
		for (const f of series.fields) {
			if (f.yAxis) { axes.push([`${name} / ${f.label}`, f.yAxis]); }
		}
	}
	return axes;
}

const allAxes: [string, AxisSpec][] = [
	...Object.entries(specRegistry).flatMap(([name, { spec }]) => axesOf(name, spec.yAxis, spec.series)),
	...Object.entries(derivedRegistry).flatMap(([name, d]) => axesOf(name, d.yAxis)),
	['replication-latency heatmap', aggregateReplicationMatrix([], []).axis!],
	[
		'replication-latency heatmap (with data)',
		aggregateReplicationMatrix([{ node: 'b', path: 'a.db.t', p95: 1, count: 1, time: 1 }], ['a', 'b']).axis!,
	],
];

describe('metric axis units', () => {
	it.each(allAxes)("%s does not repeat its formatter's unit", (_name, axis) => {
		const printed = axis.formatter ? FORMATTER_UNIT[axis.formatter] : undefined;
		if (printed) { expect(axis.unit).not.toMatch(printed); }
	});
});
