/**
 * The checks Harper runs on a job's schedule when an app loads, so a bad one is caught before it is saved rather than
 * when the app fails to load. Ported from harper `resources/scheduler/CronExpression.ts` and `scheduler.ts`, which have
 * not changed since the scheduler shipped in v5.2.0-beta.2 (checked through v5.3.5). The messages are Harper's own.
 */

const MACROS: Record<string, string> = {
	'@yearly': '0 0 1 1 *',
	'@annually': '0 0 1 1 *',
	'@monthly': '0 0 1 * *',
	'@weekly': '0 0 * * 0',
	'@daily': '0 0 * * *',
	'@midnight': '0 0 * * *',
	'@hourly': '0 * * * *',
};

export const CRON_SHORTCUTS = Object.keys(MACROS);

const MONTH_NAMES = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const DAY_OF_WEEK_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

interface FieldSpec {
	min: number;
	max: number;
	names?: string[];
	nameOffset?: number;
}

const FIELDS: [string, FieldSpec][] = [
	['minute', { min: 0, max: 59 }],
	['hour', { min: 0, max: 23 }],
	['day-of-month', { min: 1, max: 31 }],
	['month', { min: 1, max: 12, names: MONTH_NAMES, nameOffset: 1 }],
	['day-of-week', { min: 0, max: 7, names: DAY_OF_WEEK_NAMES, nameOffset: 0 }],
];

/** Harper searches eight years ahead before deciding a schedule can never fire (Feb 29 across 2100). */
const MAX_SEARCH_YEARS = 8;
const MINUTE_MS = 60_000;

class CronError extends Error {}

function parseField(fieldValue: string, spec: FieldSpec, fieldName: string, expression: string): boolean[] {
	const allowed: boolean[] = Array.from({ length: spec.max + 1 }, () => false);
	const fail = (reason: string): never => {
		throw new CronError(`Invalid ${fieldName} field "${fieldValue}" in cron expression "${expression}": ${reason}`);
	};
	const parseValue = (raw: string): number => {
		if (spec.names) {
			const nameIndex = spec.names.indexOf(raw.toUpperCase());
			if (nameIndex >= 0) {
				return nameIndex + (spec.nameOffset ?? 0);
			}
		}
		if (!/^\d+$/.test(raw)) {
			fail(`"${raw}" is not a number${spec.names ? ' or recognized name' : ''}`);
		}
		const value = Number(raw);
		if (value < spec.min || value > spec.max) {
			fail(`${value} is outside the allowed range ${spec.min}-${spec.max}`);
		}
		return value;
	};

	for (const part of fieldValue.split(',')) {
		if (part === '') {
			fail('empty list entry');
		}
		const [base, stepText, extra] = part.split('/');
		if (extra !== undefined) {
			fail('multiple "/" step separators');
		}
		let step = 1;
		if (stepText !== undefined) {
			if (!/^\d+$/.test(stepText) || Number(stepText) < 1) {
				fail(`step "${stepText}" must be a positive integer`);
			}
			step = Number(stepText);
		}
		let rangeStart: number;
		let rangeEnd: number;
		if (base === '*') {
			rangeStart = spec.min;
			rangeEnd = spec.max;
		} else if (base.includes('-')) {
			const [startText, endText, extraRange] = base.split('-');
			if (extraRange !== undefined || startText === '' || endText === '') {
				fail('malformed range');
			}
			rangeStart = parseValue(startText);
			rangeEnd = parseValue(endText);
			if (rangeStart > rangeEnd) {
				fail(`range start ${rangeStart} is greater than range end ${rangeEnd}`);
			}
		} else {
			rangeStart = parseValue(base);
			rangeEnd = stepText !== undefined ? spec.max : rangeStart;
		}
		for (let value = rangeStart; value <= rangeEnd; value += step) {
			allowed[value] = true;
		}
	}
	return allowed;
}

/** Whether a parsed expression matches some minute within the next eight years, walking wall-clock fields in UTC. */
function canFire(fields: boolean[][], dayOfMonthRestricted: boolean, dayOfWeekRestricted: boolean): boolean {
	const [minutes, hours, daysOfMonth, months, daysOfWeek] = fields;
	const dayMatches = (date: Date) => {
		const dayOfMonthMatch = daysOfMonth[date.getUTCDate()];
		const dayOfWeekMatch = daysOfWeek[date.getUTCDay()];
		if (dayOfMonthRestricted && dayOfWeekRestricted) {
			return dayOfMonthMatch || dayOfWeekMatch;
		}
		if (dayOfMonthRestricted) {
			return dayOfMonthMatch;
		}
		if (dayOfWeekRestricted) {
			return dayOfWeekMatch;
		}
		return true;
	};
	const now = Date.now();
	let candidate = new Date(Math.floor(now / MINUTE_MS) * MINUTE_MS + MINUTE_MS);
	const horizon = now + MAX_SEARCH_YEARS * 366 * 24 * 60 * MINUTE_MS;
	while (candidate.getTime() <= horizon) {
		if (!months[candidate.getUTCMonth() + 1]) {
			candidate = new Date(Date.UTC(candidate.getUTCFullYear(), candidate.getUTCMonth() + 1, 1));
		} else if (!dayMatches(candidate)) {
			candidate = new Date(Date.UTC(candidate.getUTCFullYear(), candidate.getUTCMonth(), candidate.getUTCDate() + 1));
		} else if (!hours[candidate.getUTCHours()]) {
			candidate = new Date(
				Date.UTC(
					candidate.getUTCFullYear(),
					candidate.getUTCMonth(),
					candidate.getUTCDate(),
					candidate.getUTCHours() + 1,
				),
			);
		} else if (!minutes[candidate.getUTCMinutes()]) {
			candidate = new Date(candidate.getTime() + MINUTE_MS);
		} else {
			return true;
		}
	}
	return false;
}

/** Why Harper would refuse this cron expression, or `undefined` when it accepts it. */
export function cronProblem(expression: string): string | undefined {
	const normalized = (MACROS[expression.trim().toLowerCase()] ?? expression).trim();
	const fields = normalized.split(/\s+/);
	if (fields.length !== 5) {
		return `Cron expression "${expression}" has ${fields.length} fields; expected 5 (minute hour day-of-month month day-of-week)`;
	}
	try {
		const parsed = fields.map((field, index) => parseField(field, FIELDS[index][1], FIELDS[index][0], expression));
		// 7 is an alias for Sunday
		if (parsed[4][7]) {
			parsed[4][0] = true;
		}
		if (!canFire(parsed, fields[2] !== '*', fields[4] !== '*')) {
			return `Cron expression "${expression}" can never fire`;
		}
	} catch (error) {
		if (error instanceof CronError) {
			return error.message;
		}
		throw error;
	}
	return undefined;
}

const MIN_INTERVAL_MS = 1000;
const MAX_INTERVAL_MS = 365 * 24 * 60 * 60 * 1000;
const UNIT_SECONDS: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };

/**
 * An interval in milliseconds the way Harper reads it: a number is seconds, a string is a number with an optional
 * `s`, `m`, `h` or `d`. Anything else reads as 0, as Harper's `convertToMS` does, and so fails the range check.
 */
function intervalMs(interval: unknown): number {
	if (typeof interval === 'number') {
		return interval * 1000;
	}
	if (typeof interval === 'string') {
		const trimmed = interval.trim();
		return parseFloat(trimmed) * (UNIT_SECONDS[trimmed.slice(-1)] ?? 1) * 1000;
	}
	return 0;
}

/** Why Harper would refuse this interval, or `undefined` when it accepts it. */
export function intervalProblem(interval: unknown): string | undefined {
	if (typeof interval === 'string' && !/^\d+(\.\d+)?[smhd]?$/.test(interval.trim())) {
		return `Interval "${interval}" is not a supported duration — use a number of seconds or a value like 90s, 5m, 1h, 1d`;
	}
	const ms = intervalMs(interval);
	if (!Number.isFinite(ms) || ms < MIN_INTERVAL_MS || ms > MAX_INTERVAL_MS) {
		return `Interval "${String(interval)}" must be between 1 second and 365 days (e.g. 90s, 5m, 1h, 1d)`;
	}
	return undefined;
}

/** Why Harper would refuse this IANA timezone, or `undefined` when this browser knows it. */
export function timezoneProblem(timezone: string): string | undefined {
	try {
		new Intl.DateTimeFormat('en-US', { timeZone: timezone });
		return undefined;
	} catch (error) {
		return `Unknown timezone "${timezone}": ${(error as Error).message}`;
	}
}

/** The IANA zones this browser knows, for the picker. Empty where `Intl.supportedValuesOf` is missing. */
export function knownTimezones(): string[] {
	const supportedValuesOf = (Intl as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
	return supportedValuesOf ? supportedValuesOf('timeZone') : [];
}

/** `15m` → `every 15 minutes`; a bare number is seconds. Falls back to the value as written. */
export function describeInterval(interval: unknown): string {
	const ms = intervalMs(interval);
	if (intervalProblem(interval)) {
		return String(interval);
	}
	const units: [number, string][] = [[86_400_000, 'day'], [3_600_000, 'hour'], [60_000, 'minute'], [1000, 'second']];
	for (const [size, name] of units) {
		if (ms % size === 0) {
			const count = ms / size;
			return count === 1 ? `every ${name}` : `every ${count} ${name}s`;
		}
	}
	return `every ${ms / 1000} seconds`;
}
