import { describe, expect, it } from 'vitest';
import { cronProblem, describeInterval, intervalProblem, timezoneProblem } from './schedule';

/**
 * Harper's own verdicts, captured by running each value through harper 5.3.5's `CronExpression` and the interval check in
 * `resources/scheduler/scheduler.ts` (`convertToMS` plus its format and range checks). Studio must agree with every row,
 * or it either refuses a job Harper accepts or saves one that stops the app loading.
 */
const HARPER_CRON_VERDICTS: [string, string | undefined][] = [
	['0 2 * * *', undefined],
	['@daily', undefined],
	['@Daily', undefined],
	[' @hourly ', undefined],
	['@weekly', undefined],
	['@reboot', 'Cron expression "@reboot" has 1 fields; expected 5 (minute hour day-of-month month day-of-week)'],
	['*/15 * * * *', undefined],
	['0 9-17 * * MON-FRI', undefined],
	['0 0 * * 7', undefined],
	['0 0 * * sun', undefined],
	['5/15 * * * *', undefined],
	['0 0 1,15 * *', undefined],
	['0 0 30 2 *', 'Cron expression "0 0 30 2 *" can never fire'],
	['0 0 29 2 *', undefined],
	['0 0 31 4 *', 'Cron expression "0 0 31 4 *" can never fire'],
	['0 0 31 4,5 *', undefined],
	['* * * *', 'Cron expression "* * * *" has 4 fields; expected 5 (minute hour day-of-month month day-of-week)'],
	[
		'* * * * * *',
		'Cron expression "* * * * * *" has 6 fields; expected 5 (minute hour day-of-month month day-of-week)',
	],
	['60 * * * *', 'Invalid minute field "60" in cron expression "60 * * * *": 60 is outside the allowed range 0-59'],
	['* 24 * * *', 'Invalid hour field "24" in cron expression "* 24 * * *": 24 is outside the allowed range 0-23'],
	['* * 0 * *', 'Invalid day-of-month field "0" in cron expression "* * 0 * *": 0 is outside the allowed range 1-31'],
	['* * * 13 *', 'Invalid month field "13" in cron expression "* * * 13 *": 13 is outside the allowed range 1-12'],
	['* * * * 8', 'Invalid day-of-week field "8" in cron expression "* * * * 8": 8 is outside the allowed range 0-7'],
	['*/0 * * * *', 'Invalid minute field "*/0" in cron expression "*/0 * * * *": step "0" must be a positive integer'],
	['1/2/3 * * * *', 'Invalid minute field "1/2/3" in cron expression "1/2/3 * * * *": multiple "/" step separators'],
	[
		'10-5 * * * *',
		'Invalid minute field "10-5" in cron expression "10-5 * * * *": range start 10 is greater than range end 5',
	],
	['1-2-3 * * * *', 'Invalid minute field "1-2-3" in cron expression "1-2-3 * * * *": malformed range'],
	['-5 * * * *', 'Invalid minute field "-5" in cron expression "-5 * * * *": malformed range'],
	['a * * * *', 'Invalid minute field "a" in cron expression "a * * * *": "a" is not a number'],
	[
		'* * * FOO *',
		'Invalid month field "FOO" in cron expression "* * * FOO *": "FOO" is not a number or recognized name',
	],
	['1,,2 * * * *', 'Invalid minute field "1,,2" in cron expression "1,,2 * * * *": empty list entry'],
	['0 0 * JAN-MAR *', undefined],
	['0 0 * * MON,WED,FRI', undefined],
	// Day of month OR day of week once both are restricted, so the 31st of February still fires on Mondays.
	['0 0 31 2 1', undefined],
	['', 'Cron expression "" has 1 fields; expected 5 (minute hour day-of-month month day-of-week)'],
	['   ', 'Cron expression "   " has 1 fields; expected 5 (minute hour day-of-month month day-of-week)'],
	['0  2 * *  *', undefined],
	['*/7 */5 */3 */2 */4', undefined],
	['0 0 30 2 MON', undefined],
	['00 02 * * *', undefined],
];

const HARPER_INTERVAL_VERDICTS: [unknown, 'ok' | 'unsupported' | 'range'][] = [
	['90s', 'ok'],
	['5m', 'ok'],
	['1h', 'ok'],
	['1d', 'ok'],
	[90, 'ok'],
	['90', 'ok'],
	['0.5s', 'range'],
	['1s', 'ok'],
	[1, 'ok'],
	[0.5, 'range'],
	['500ms', 'unsupported'],
	['366d', 'range'],
	['365d', 'ok'],
	['1.5m', 'ok'],
	[' 15m ', 'ok'],
	['abc', 'unsupported'],
	['', 'unsupported'],
	['1M', 'unsupported'],
	['1y', 'unsupported'],
	[-5, 'range'],
	[0, 'range'],
	[true, 'range'],
	[null, 'range'],
	['1e3', 'unsupported'],
	[31536000, 'ok'],
	[31536001, 'range'],
	['8760h', 'ok'],
	['525600m', 'ok'],
	['1.5', 'ok'],
	['10S', 'unsupported'],
];

describe('cronProblem', () => {
	it.each(HARPER_CRON_VERDICTS)('agrees with Harper on %j', (expression, expected) => {
		expect(cronProblem(expression)).toBe(expected);
	});
});

describe('intervalProblem', () => {
	it.each(HARPER_INTERVAL_VERDICTS)('agrees with Harper on %j', (interval, expected) => {
		const problem = intervalProblem(interval);
		if (expected === 'ok') {
			expect(problem).toBeUndefined();
		} else if (expected === 'unsupported') {
			expect(problem).toMatch(/is not a supported duration/);
		} else {
			expect(problem).toMatch(/must be between 1 second and 365 days/);
		}
	});
});

describe('timezoneProblem', () => {
	it('accepts an IANA zone and refuses a misspelling', () => {
		expect(timezoneProblem('America/New_York')).toBeUndefined();
		expect(timezoneProblem('America/NewYork')).toMatch(/^Unknown timezone "America\/NewYork"/);
	});
});

describe('describeInterval', () => {
	it.each([
		['15m', 'every 15 minutes'],
		['1h', 'every hour'],
		[90, 'every 90 seconds'],
		['90s', 'every 90 seconds'],
		['1.5m', 'every 90 seconds'],
		['2d', 'every 2 days'],
		['1.5', 'every 1.5 seconds'],
	])('%j reads as %j', (interval, text) => {
		expect(describeInterval(interval)).toBe(text);
	});

	it('shows an interval Harper refuses as written', () => {
		expect(describeInterval('500ms')).toBe('500ms');
	});
});
