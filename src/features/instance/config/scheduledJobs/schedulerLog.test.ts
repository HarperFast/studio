import { schedulerJobRowId } from '@/integrations/api/instance/scheduler/scheduler';
import { ReadLogItem } from '@/integrations/api/instance/status/getReadLog';
import { describe, expect, it } from 'vitest';
import { indexSchedulerLog } from './schedulerLog';

const lastLoggedFailure = (log: ReadLogItem[], app: string, job: string) =>
	indexSchedulerLog(log).failures.get(schedulerJobRowId(app, job));
const lastLoggedTakeover = (log: ReadLogItem[]) => indexSchedulerLog(log).takeover;
const lastLoggedLoadError = (log: ReadLogItem[], app: string) => indexSchedulerLog(log).loadErrors.get(app);

function line(partial: Partial<ReadLogItem> & Pick<ReadLogItem, 'message' | 'timestamp'>): ReadLogItem {
	return { level: 'warn', thread: 'http/1', tags: ['scheduler'], node: '', ...partial };
}

/** Lines as harper 5.3.5's `read_log` returned them, filtered on `scheduler`, newest first. */
const LOG: ReadLogItem[] = [
	line({
		timestamp: '2026-11-05T21:45:20.494Z',
		level: 'error',
		tags: [],
		message:
			'SchedulerConfigError: Could not load component \'scheduler\' for application \'broken-app\' due to: Scheduler job "nightly" in component broken-app: "./jobs.js" has no function export named "missingExport"\n    at resolveHandler (/harper/resources/scheduler/scheduler.ts:231:9)\n    at async buildJob (/harper/resources/scheduler/scheduler.ts:157:12) statusCode=400',
	}),
	line({
		timestamp: '2026-11-05T21:45:00.001Z',
		message: 'Job job:metrics-app:flaky-report failed after 0ms: report service returned 503',
	}),
	line({ timestamp: '2026-11-05T21:43:35.384Z', level: 'info', message: 'Scheduler leader started on node-b' }),
	line({
		timestamp: '2026-11-05T21:43:00.002Z',
		message: 'Job job:metrics-app:flaky-report failed after 1ms: an earlier failure',
	}),
	line({
		timestamp: '2026-11-05T21:42:34.691Z',
		level: 'error',
		tags: [],
		message:
			"HdbError: This operation is not authorized due to role restrictions and/or invalid database items: Table 'system.hdb_scheduler_state' does not exist statusCode=403",
	}),
	line({ timestamp: '2026-11-05T21:41:16.353Z', level: 'info', message: 'Scheduler leader started on node-a' }),
];

describe('lastLoggedFailure', () => {
	it("reads the newest failure of a job, with Harper's error", () => {
		expect(lastLoggedFailure(LOG, 'metrics-app', 'flaky-report')).toEqual({
			at: '2026-11-05T21:45:00.001Z',
			durationMs: 0,
			error: 'report service returned 503',
			node: undefined,
		});
	});

	it('finds the newest whatever order the lines arrive in, as a cluster merges every node', () => {
		expect(lastLoggedFailure([...LOG].reverse(), 'metrics-app', 'flaky-report')?.error).toBe(
			'report service returned 503',
		);
	});

	it('names the node on a cluster', () => {
		const clustered = [line({ ...LOG[1], node: 'node-b' })];
		expect(lastLoggedFailure(clustered, 'metrics-app', 'flaky-report')?.node).toBe('node-b');
	});

	it('never gives one job another’s failure', () => {
		expect(lastLoggedFailure(LOG, 'metrics-app', 'flaky')).toBeUndefined();
		expect(lastLoggedFailure(LOG, 'metrics', 'app:flaky-report')).toBeUndefined();
		expect(lastLoggedFailure(LOG, 'metrics-app', 'sync-rates')).toBeUndefined();
	});

	it('keeps a multi-line error whole', () => {
		const log = [line({ timestamp: 't', message: 'Job job:a:b failed after 12ms: first\nsecond' })];
		expect(lastLoggedFailure(log, 'a', 'b')).toMatchObject({ durationMs: 12, error: 'first\nsecond' });
	});
});

describe('lastLoggedTakeover', () => {
	it('reads the newest node to take over', () => {
		expect(lastLoggedTakeover(LOG)).toEqual({ at: '2026-11-05T21:43:35.384Z', node: 'node-b' });
		expect(lastLoggedTakeover([])).toBeUndefined();
	});
});

describe('lastLoggedLoadError', () => {
	it("reads Harper's reason without the stack or status code", () => {
		expect(lastLoggedLoadError(LOG, 'broken-app')).toEqual({
			at: '2026-11-05T21:45:20.494Z',
			reason:
				'Scheduler job "nightly" in component broken-app: "./jobs.js" has no function export named "missingExport"',
		});
	});

	it('drops the stack of a log written with CRLF line endings', () => {
		const log = [
			line({
				timestamp: 't',
				level: 'error',
				message:
					"Error: Could not load component 'scheduler' for application 'a' due to: bad cron\r\n    at x (/y.ts:1:1)",
			}),
		];
		expect(lastLoggedLoadError(log, 'a')?.reason).toBe('bad cron');
	});

	it('drops a status code Harper appends to a reason with no stack', () => {
		const log = [
			line({
				timestamp: 't',
				level: 'error',
				message: "Error: Could not load component 'scheduler' for application 'a' due to: bad cron statusCode=400",
			}),
		];
		expect(lastLoggedLoadError(log, 'a')?.reason).toBe('bad cron');
	});

	it("never reports another app's failure", () => {
		expect(lastLoggedLoadError(LOG, 'broken')).toBeUndefined();
		expect(lastLoggedLoadError(LOG, 'metrics-app')).toBeUndefined();
	});

	it('keeps an older reason when the newest line has none', () => {
		const log = [
			line({
				timestamp: '2026-11-05T22:00:00.000Z',
				level: 'error',
				message: "Error: Could not load component 'scheduler' for application 'a' due to: \n    at x (/y.ts:1:1)",
			}),
			line({
				timestamp: '2026-11-05T21:00:00.000Z',
				level: 'error',
				message: "Error: Could not load component 'scheduler' for application 'a' due to: bad cron",
			}),
		];
		expect(lastLoggedLoadError(log, 'a')).toEqual({ at: '2026-11-05T21:00:00.000Z', reason: 'bad cron' });
	});
});
