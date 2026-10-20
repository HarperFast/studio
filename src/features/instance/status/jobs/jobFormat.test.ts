import { describe, expect, it } from 'vitest';
import { describeJobStatus, formatJobTime, jobDurationMs } from './jobFormat';

describe('describeJobStatus', () => {
	it.each([
		['CREATED', 'Queued', 'secondary'],
		['IN_PROGRESS', 'Running', 'default'],
		['COMPLETE', 'Complete', 'success'],
		['ERROR', 'Failed', 'destructive'],
		['complete', 'Complete', 'success'],
	])('labels %s as %s', (status, label, variant) => {
		expect(describeJobStatus(status)).toEqual({ label, variant });
	});

	it('shows an unrecognized status verbatim', () => {
		expect(describeJobStatus('PAUSED')).toEqual({ label: 'PAUSED', variant: 'outline' });
		expect(describeJobStatus(undefined)).toEqual({ label: 'Unknown', variant: 'outline' });
	});
});

describe('jobDurationMs', () => {
	it('measures a finished job from start to end', () => {
		expect(jobDurationMs({ status: 'COMPLETE', start_datetime: 1_000, end_datetime: 4_500 })).toBe(3_500);
		expect(jobDurationMs({ status: 'ERROR', start_datetime: 1_000, end_datetime: 1_200 })).toBe(200);
	});

	it('has no duration while the job is still queued or running', () => {
		expect(jobDurationMs({ status: 'IN_PROGRESS', start_datetime: 1_000 })).toBeUndefined();
		expect(jobDurationMs({ status: 'CREATED', start_datetime: 1_000, end_datetime: 2_000 })).toBeUndefined();
	});

	it('has no duration when a timestamp is missing', () => {
		expect(jobDurationMs({ status: 'COMPLETE', end_datetime: 2_000 })).toBeUndefined();
	});
});

describe('formatJobTime', () => {
	it('shows a dash for a missing timestamp', () => {
		expect(formatJobTime(undefined)).toBe('—');
	});

	it('formats a timestamp in the local time zone', () => {
		expect(formatJobTime(0)).toBe(new Date(0).toLocaleString());
	});
});
