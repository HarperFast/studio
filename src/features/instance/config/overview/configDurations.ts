/**
 * Says a duration setting in words, the way Harper reads it. Harper has two readers with different units, so each
 * setting is listed with its own:
 *
 * - `convertToMS` (harper `utility/common_utils.ts`): a number, then a case-sensitive unit in the last character
 *   (`M` a 30-day month, `m` a minute). Anything else is seconds, so `3 days` is read as 3 seconds.
 * - the `ms` package, through jsonwebtoken's `expiresIn` (harper `security/tokenAuthentication.ts`): case-insensitive
 *   units, `m` and `M` both minutes, no unit milliseconds, and a number (not a string) seconds. A numeric string
 *   is a number by then: `set_configuration` casts it (`castConfigValue` → `autoCast`, `utility/common_utils.ts`).
 */
type DurationReader = 'convertToMS' | 'ms';

const DURATION_SETTINGS: Record<string, DurationReader> = {
	'logging.auditRetention': 'convertToMS',
	'logging.rotation.interval': 'convertToMS',
	'logging.rotation.retention': 'convertToMS',
	'authentication.operationTokenTimeout': 'ms',
	'authentication.refreshTokenTimeout': 'ms',
};

type Unit = 'millisecond' | 'second' | 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year';

const CONVERT_TO_MS_UNITS: Record<string, Unit> = {
	y: 'year',
	Y: 'year',
	M: 'month',
	D: 'day',
	d: 'day',
	H: 'hour',
	h: 'hour',
	m: 'minute',
};

const MS_PACKAGE =
	/^(-?(?:\d+)?\.?\d+) *(milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|years?|yrs?|y)?$/i;

function msPackageUnit(word: string | undefined): Unit {
	const unit = word?.toLowerCase();
	if (!unit || unit.startsWith('ms') || unit.startsWith('msec') || unit.startsWith('milli')) { return 'millisecond'; }
	if (unit.startsWith('s')) { return 'second'; }
	if (unit.startsWith('m')) { return 'minute'; }
	if (unit.startsWith('h')) { return 'hour'; }
	if (unit.startsWith('d')) { return 'day'; }
	if (unit.startsWith('w')) { return 'week'; }
	return 'year';
}

const NUMERIC = /^-?\d+(?:\.\d+)?$/;

function read(reader: DurationReader, written: unknown): { amount: number; unit: Unit } | undefined {
	const value = typeof written === 'string' && NUMERIC.test(written) ? Number(written) : written;
	if (typeof value === 'number') {
		return Number.isFinite(value) ? { amount: value, unit: 'second' } : undefined;
	}
	if (typeof value !== 'string') { return undefined; }
	if (reader === 'convertToMS') {
		const amount = Number.parseFloat(value);
		return Number.isFinite(amount) ? { amount, unit: CONVERT_TO_MS_UNITS[value.slice(-1)] ?? 'second' } : undefined;
	}
	const match = MS_PACKAGE.exec(value);
	return match ? { amount: Number.parseFloat(match[1]), unit: msPackageUnit(match[2]) } : undefined;
}

export interface ConfigDuration {
	words?: string;
}

export function isDurationSetting(path: readonly string[]): boolean {
	return Object.hasOwn(DURATION_SETTINGS, path.join('.'));
}

export function describeConfigDuration(path: readonly string[], value: unknown): ConfigDuration | undefined {
	const reader = DURATION_SETTINGS[path.join('.')];
	if (!reader || value === undefined || value === null) { return undefined; }
	const duration = read(reader, value);
	if (!duration) { return {}; }
	const { amount, unit } = duration;
	return { words: `${amount} ${unit}${amount === 1 ? '' : 's'}` };
}

export function withDurationWords(path: readonly string[], value: unknown, formatted: string): string {
	const words = describeConfigDuration(path, value)?.words;
	return words && words !== formatted ? `${formatted} (${words})` : formatted;
}
