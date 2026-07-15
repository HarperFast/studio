import { describe, expect, it } from 'vitest';
import type { AnalyticsDataPoint, HeatmapData, SeriesData } from '../types/analytics';
import { chartCsv, computeMetricCsvData, heatmapToCsv, makeCsvFilename, seriesToCsv } from './csvExport';

function lines(csv: string): string[] {
	// Trailing CRLF terminates the last record — strip it before splitting.
	expect(csv.endsWith('\r\n')).toBe(true);
	return csv.slice(0, -2).split('\r\n');
}

describe('seriesToCsv', () => {
	it('emits an ISO-8601 timestamp column plus one column per series, in series order', () => {
		const data: SeriesData = {
			series: [
				{ key: 'a', label: 'alpha', points: [{ x: 0, y: 1 }, { x: 60_000, y: 2 }] },
				{ key: 'b', label: 'beta', points: [{ x: 0, y: 10 }, { x: 60_000, y: 20 }] },
			],
		};
		expect(lines(seriesToCsv(data))).toEqual([
			'timestamp,alpha,beta',
			'1970-01-01T00:00:00.000Z,1,10',
			'1970-01-01T00:01:00.000Z,2,20',
		]);
	});

	it('unions x values across series and leaves empty cells for gaps and null samples', () => {
		const data: SeriesData = {
			series: [
				// null y = explicit gap; missing x = no sample at that timestamp.
				{ key: 'a', label: 'alpha', points: [{ x: 0, y: null }, { x: 120_000, y: 3 }] },
				{ key: 'b', label: 'beta', points: [{ x: 60_000, y: 5 }] },
			],
		};
		expect(lines(seriesToCsv(data))).toEqual([
			'timestamp,alpha,beta',
			'1970-01-01T00:00:00.000Z,,',
			'1970-01-01T00:01:00.000Z,,5',
			'1970-01-01T00:02:00.000Z,3,',
		]);
	});

	it('escapes labels containing commas, quotes, and newlines per RFC 4180', () => {
		const data: SeriesData = {
			series: [
				{ key: 'a', label: 'a,b', points: [{ x: 0, y: 1 }] },
				{ key: 'b', label: 'say "hi"', points: [{ x: 0, y: 2 }] },
				{ key: 'c', label: 'two\nlines', points: [{ x: 0, y: 3 }] },
			],
		};
		expect(lines(seriesToCsv(data))[0]).toBe('timestamp,"a,b","say ""hi""","two\nlines"');
	});

	it('neutralizes formula-leading labels so spreadsheets import them as text', () => {
		const data: SeriesData = {
			series: [
				{ key: 'a', label: '=SUM(A1:A9)', points: [{ x: 0, y: 1 }] },
				{ key: 'b', label: '+p95', points: [{ x: 0, y: 2 }] },
				{ key: 'c', label: '@cmd', points: [{ x: 0, y: 3 }] },
				{ key: 'd', label: '-neg', points: [{ x: 0, y: -4 }] },
			],
		};
		const out = lines(seriesToCsv(data));
		expect(out[0]).toBe(`timestamp,'=SUM(A1:A9),'+p95,'@cmd,'-neg`);
		// Numeric cells keep their sign — only string cells are neutralized.
		expect(out[1]).toBe('1970-01-01T00:00:00.000Z,1,2,3,-4');
	});

	it('dedupes duplicate labels by appending the series key', () => {
		const data: SeriesData = {
			series: [
				{ key: 'db1|n1', label: 'db1', points: [{ x: 0, y: 1 }] },
				{ key: 'db1|n2', label: 'db1', points: [{ x: 0, y: 2 }] },
			],
		};
		expect(lines(seriesToCsv(data))[0]).toBe('timestamp,db1 (db1|n1),db1 (db1|n2)');
	});

	it('includes the ceiling series as a trailing column when present', () => {
		const data: SeriesData = {
			series: [{ key: 'heap', label: 'heap', points: [{ x: 0, y: 1 }] }],
			ceiling: { key: 'rss', label: 'rss', points: [{ x: 0, y: 8 }] },
		};
		expect(lines(seriesToCsv(data))).toEqual([
			'timestamp,heap,rss',
			'1970-01-01T00:00:00.000Z,1,8',
		]);
	});

	it('returns only the header for empty series data', () => {
		expect(lines(seriesToCsv({ series: [] }))).toEqual(['timestamp']);
	});
});

describe('heatmapToCsv', () => {
	it('emits row,col,value,count with empty cells for absent values/counts', () => {
		const data: HeatmapData = {
			rows: ['n1', 'n2'],
			cols: ['n2'],
			cells: [
				{ row: 'n1', col: 'n2', value: 12.5, count: 40 },
				{ row: 'n2', col: 'n2', value: null },
			],
			skippedRecordsCount: 0,
		};
		expect(lines(heatmapToCsv(data))).toEqual([
			'row,col,value,count',
			'n1,n2,12.5,40',
			'n2,n2,,',
		]);
	});

	it('escapes row/col labels per RFC 4180', () => {
		const data: HeatmapData = {
			rows: ['a,b'],
			cols: ['c"d'],
			cells: [{ row: 'a,b', col: 'c"d', value: 1, count: 2 }],
			skippedRecordsCount: 0,
		};
		expect(lines(heatmapToCsv(data))[1]).toBe('"a,b","c""d",1,2');
	});

	it('names the value column after the exported field when one is supplied', () => {
		const data: HeatmapData = {
			rows: ['n1'],
			cols: ['n2'],
			cells: [{ row: 'n1', col: 'n2', value: 3, count: 4 }],
			skippedRecordsCount: 0,
		};
		expect(lines(heatmapToCsv(data, 'p95'))[0]).toBe('row,col,p95,count');
	});

	it('adds a confidence column mirroring the chart tiers, keeping suppressed values', () => {
		// Tier boundaries mirror classifyCell in primitives/HeatmapMatrix.tsx:
		// suppress when count < greyBelow, grey when greyBelow ≤ count <
		// suppressBelow, absent when the cell has no value.
		const data: HeatmapData = {
			rows: ['n1', 'n2'],
			cols: ['n3'],
			cells: [
				{ row: 'n1', col: 'n3', value: 12.5, count: 39 }, // below greyBelow
				{ row: 'n2', col: 'n3', value: 8, count: 40 }, // grey band
				{ row: 'n3', col: 'n3', value: 5, count: 100 }, // settled
				{ row: 'n4', col: 'n3', value: null, count: 0 }, // no data
			],
			confidence: { greyBelow: 40, suppressBelow: 100 },
			skippedRecordsCount: 0,
		};
		expect(lines(heatmapToCsv(data))).toEqual([
			'row,col,value,count,confidence',
			'n1,n3,12.5,39,suppress',
			'n2,n3,8,40,grey',
			'n3,n3,5,100,ok',
			'n4,n3,,0,absent',
		]);
	});
});

describe('makeCsvFilename', () => {
	it('produces <metric>-<start>-<end>.csv with a sanitized metric slug', () => {
		const name = makeCsvFilename('CPU usage %', { startTime: 0, endTime: 60_000 });
		expect(name).toBe('cpu-usage-1970-01-01T00-00-00-000Z-1970-01-01T00-01-00-000Z.csv');
	});
});

describe('computeMetricCsvData', () => {
	const window = { startTime: 0, endTime: 120_000 };

	it('returns null for empty records and for unknown metrics', () => {
		expect(computeMetricCsvData('cpu-usage', [], window, [])).toBeNull();
		const rows: AnalyticsDataPoint[] = [{ time: 0, node: 'n1' }];
		expect(computeMetricCsvData('no-such-metric', rows, window, ['n1'])).toBeNull();
	});

	it('runs the spec pipeline for a Renderer-backed groupBy metric (connections)', () => {
		const rows: AnalyticsDataPoint[] = [
			{ time: 60_000, node: 'n1', type: 'mqtt', connections: 5, period: 60_000, count: 1 },
			{ time: 60_000, node: 'n1', type: 'ws', connections: 3, period: 60_000, count: 1 },
		];
		const out = computeMetricCsvData('connections', rows, window, ['n1']);
		expect(out?.kind).toBe('series');
		if (out?.kind !== 'series') { return; }
		expect(out.data.series.map((s) => s.dim).sort()).toEqual(['mqtt', 'ws']);
	});

	it('preprocesses connection records so the pathMethod groupBy is not empty', () => {
		const rows: AnalyticsDataPoint[] = [
			{
				time: 60_000,
				node: 'n1',
				path: 'mqtt',
				method: 'connect',
				ratio: 0.995,
				total: 199,
				count: 200,
				period: 60_000,
			},
			{
				time: 60_000,
				node: 'n1',
				path: 'mqtt',
				method: 'disconnect',
				ratio: 0.5,
				total: 300,
				count: 600,
				period: 60_000,
			},
		];
		const out = computeMetricCsvData('connection', rows, window, ['n1']);
		expect(out?.kind).toBe('series');
		if (out?.kind !== 'series') { return; }
		expect(out.data.series.map((s) => s.dim).sort()).toEqual(['mqtt · connect', 'mqtt · disconnect']);
	});

	it('uses the derived recompute for derived metrics (request-rate)', () => {
		const rows: AnalyticsDataPoint[] = [
			{ time: 60_000, node: 'n1', path: '/dogs', count: 30, period: 60_000 },
		];
		const out = computeMetricCsvData('request-rate', rows, window, ['n1']);
		expect(out?.kind).toBe('series');
		if (out?.kind !== 'series') { return; }
		expect(out.data.series).toHaveLength(1);
		expect(out.data.series[0].label).toBe('/dogs');
		expect(out.data.series[0].points).toEqual([{ x: 60_000, y: 0.5, count: 30 }]);
	});

	it('returns heatmap data for replication-latency', () => {
		const rows: AnalyticsDataPoint[] = [
			{ time: 60_000, node: 'n2', path: 'not-a-replication-path', count: 1 },
		];
		const out = computeMetricCsvData('replication-latency', rows, window, ['n1', 'n2']);
		expect(out?.kind).toBe('heatmap');
	});

	it('serializes replication-latency with a p95 value column and confidence tiers', () => {
		const rows: AnalyticsDataPoint[] = [
			// count 20 < greyBelow (40) → the chart suppresses this cell; the
			// CSV keeps the number and flags the row instead.
			{ time: 60_000, node: 'n2', path: 'n1.db.dogs', p95: 12, count: 20 },
		];
		const out = computeMetricCsvData('replication-latency', rows, window, ['n1', 'n2']);
		expect(out?.kind).toBe('heatmap');
		if (out?.kind !== 'heatmap') { return; }
		expect(out.valueColumn).toBe('p95');
		expect(lines(chartCsv(out))).toEqual([
			'row,col,p95,count,confidence',
			'n1,n2,12,20,suppress',
		]);
	});
});
