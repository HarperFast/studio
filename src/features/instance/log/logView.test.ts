import { ReadLogItem } from '@/integrations/api/instance/status/getReadLog';
import { describe, expect, it } from 'vitest';
import { logKey, mergeReadLogs } from './hooks/mergeReadLogs';
import {
	buildLogLink,
	DEFAULT_LOG_FILTERS,
	localDateTime,
	logMatchesTarget,
	parseLogTarget,
	surroundingFilters,
	validateLogSearch,
	validDateRange,
	withTimeRange,
} from './logView';

const log: ReadLogItem = {
	level: 'error',
	timestamp: '2026-11-19T21:45:00.123Z',
	node: 'node-a',
	thread: 'http/2',
	tags: [],
	message: 'secret token: abc',
};

describe('logs view contracts', () => {
	it('relative time is open-ended for live logs and Latest clears both bounds', () => {
		const result = withTimeRange({ ...DEFAULT_LOG_FILTERS, until: log.timestamp }, '15');
		expect(result).toMatchObject({ relative_minutes: '15', from: '', until: '' });
		expect(withTimeRange(result, 'latest')).toMatchObject({ relative_minutes: undefined, from: '', until: '' });
		expect(withTimeRange(result, 'custom').relative_minutes).toBeUndefined();
	});
	it('validates absolute bounds and preserves milliseconds through local datetime inputs', () => {
		expect(validDateRange('bad', '')).toBe(false);
		expect(validDateRange('2026-11-20', '2026-11-19')).toBe(false);
		expect(validDateRange('', '')).toBe(true);
		expect(Date.parse(localDateTime(new Date(log.timestamp)))).toBe(Date.parse(log.timestamp));
	});
	it('surrounding logs relax severity and text, preserve file, and bound the response', () => {
		const result = surroundingFilters({
			...DEFAULT_LOG_FILTERS,
			filter: 'secret',
			level: 'error',
			relative_minutes: '15',
			log_name: 'system.log',
		}, log.timestamp);
		expect(result).toMatchObject({
			filter: '',
			level: 'undefined',
			limit: '1000',
			log_name: 'system.log',
			relative_minutes: undefined,
		});
		expect(Date.parse(result.from!)).toBe(Date.parse(log.timestamp) - 30000);
		expect(Date.parse(result.until!)).toBe(Date.parse(log.timestamp) + 30000);
	});
	it('copies a hash-route link without message or search text, then matches the same entry', () => {
		const href = buildLogLink('https://studio.example/#/org/clu/logs?filter=private', log, 'system.log');
		expect(href).not.toContain('secret');
		expect(href).not.toContain('private');
		const target = parseLogTarget(new URLSearchParams(new URL(href).hash.split('?')[1]).get('log'))!;
		expect(target.source).toBe('system.log');
		expect(validateLogSearch({ log: target })).toEqual({ log: target });
		expect(validateLogSearch({ log: JSON.stringify(target) })).toEqual({ log: target });
		expect(logMatchesTarget(log, target)).toBe(true);
		expect(logMatchesTarget({ ...log, message: 'different' }, target)).toBe(false);
	});
	it('ignores malformed, overlong, and out-of-range link targets', () => {
		for (
			const value of [
				'{',
				'x'.repeat(3000),
				...['-271821-04-20T00:01:00.000Z', '+275760-09-12T23:59:00.000Z'].map(timestamp =>
					JSON.stringify({ timestamp, node: '', thread: '', fingerprint: 'a', source: 'hdb.log' })
				),
				JSON.stringify({ timestamp: 'bad' }),
				JSON.stringify({
					timestamp: '+275760-09-13T00:00:00.000Z',
					node: '',
					thread: '',
					fingerprint: 'a',
					source: 'hdb.log',
				}),
			]
		) {
			expect(parseLogTarget(value)).toBeUndefined();
			expect(validateLogSearch({ log: value })).toEqual({});
		}
	});
	it('uses unambiguous shared row identity and the same duplicate rule before and after streaming', () => {
		const a = { ...log, node: 'a|b', thread: 'c' };
		const b = { ...log, node: 'a', thread: 'b|c' };
		expect(logKey(a)).not.toBe(logKey(b));
		expect(logKey({ ...log })).toBe(logKey(log));
		expect(mergeReadLogs([log, { ...log }], [], 100)).toEqual([log]);
		expect(mergeReadLogs([log, { ...log }], [{ ...log }], 100).map(logKey)).toEqual([logKey(log)]);
	});
});

it('bounds identity caching even while callers retain old record objects', () => {
	mergeReadLogs([], [], 100);
	let reads = 0;
	const original = {
		...log,
		get message() {
			reads++;
			return 'same message';
		},
	};
	const first = logKey(original);
	expect(logKey(original)).toBe(first);
	expect(reads).toBe(1);
	const retained: ReadLogItem[] = [];
	for (let index = 0; index < 30001; index++) {
		const next = { ...log, message: String(index) };
		retained.push(next);
		logKey(next);
	}
	expect(logKey(original)).toBe(first);
	expect(reads).toBe(2);
	expect(retained).toHaveLength(30001);
});
