export type ValueFormatter = 'bytes-si' | 'bytes-iec' | 'ms' | 'percent' | 'cores' | 'count' | 'count-si';

/**
 * THE value formatter for chart axes and tooltips. Every Status-analytics
 * chart — metric panels and the table-size charts alike — formats through
 * this one code path, so the same byte/count value can never render two
 * different ways on two panels — and it lives in src/lib because other
 * features (e.g. the databases overview) format the same values.
 *
 * Deliberately NOT delegated to the app-wide helpers
 * (src/lib/humanFileSize.ts / src/lib/humanNumber.ts): those are
 * prose-oriented — they round to integers in a fixed unit ("1,234 MB"),
 * which is right for body copy but wrong for axis ticks, where scaling to
 * the largest unit ("1.2 GB", "50k") keeps tick labels short. Digits are
 * grouped (with a fixed ",", not the locale's) only where no larger unit
 * exists: exact counts, and values past the top of a unit ladder.
 */
export function formatValue(
	v: number | null | undefined,
	formatter?: ValueFormatter,
	unitSuffix?: string,
): string {
	if (v === null || v === undefined || !Number.isFinite(v)) { return '—'; }
	const base = formatBase(v, formatter);
	// unitSuffix is meant to *compose* with the formatter's unit, not
	// duplicate it. Specs should set unitSuffix to '' when the formatter
	// already includes the right unit (e.g. formatter: 'ms' → spec sets
	// unit: ''), and to a modifier like '/s' when adding rate context
	// (formatter: 'bytes-si' + unit: '/s' → "MB/s").
	return unitSuffix ? `${base}${unitSuffix}` : base;
}

interface ScaleUnit {
	label: string;
	/** One of this unit, expressed in the formatter's input unit. */
	size: number;
}

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const YEAR = 365.25 * DAY;

interface DurationUnit extends ScaleUnit {
	/** Axis tick steps, in this unit, for an axis whose top falls in it. */
	tickSteps: readonly number[];
}

const DECIMAL_STEPS = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200];
const SEXAGESIMAL_STEPS = [0.5, 1, 2, 5, 10, 15, 30];

const DURATION_UNITS: readonly DurationUnit[] = [
	{ label: 'µs', size: 0.001, tickSteps: DECIMAL_STEPS },
	{ label: 'ms', size: 1, tickSteps: DECIMAL_STEPS },
	{ label: 's', size: SECOND, tickSteps: SEXAGESIMAL_STEPS },
	{ label: 'min', size: MINUTE, tickSteps: SEXAGESIMAL_STEPS },
	{ label: 'h', size: HOUR, tickSteps: [0.5, 1, 2, 3, 6, 12] },
	{ label: 'd', size: DAY, tickSteps: [0.5, 1, 2, 7, 14, 30, 60, 90] },
	{ label: 'yr', size: YEAR, tickSteps: [0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000] },
];

export interface DurationAxis {
	ticks: number[];
	/** Labels every tick in the same unit, so "360 d" is never followed by "1.2 yr". */
	format: (v: number) => string;
}

/** Ticks for a millisecond axis from 0 to `max` at whole steps of one unit
 *  (2 d, 4 d), where a chart's own round-millisecond steps land on 2.3 d. */
export function durationTicks(max: number, maxSteps = 5): DurationAxis | undefined {
	if (!Number.isFinite(max) || max <= 0) { return undefined; }
	let i = 0;
	while (i < DURATION_UNITS.length - 1 && max >= DURATION_UNITS[i + 1].size) { i++; }
	const { label, size, tickSteps } = DURATION_UNITS[i];
	const top = max / size;
	const step = tickSteps.find((s) => top / s <= maxSteps);
	if (step === undefined) { return undefined; }
	return {
		ticks: Array.from({ length: Math.ceil(top / step) + 1 }, (_, n) => n * step * size),
		format: (v) => `${significant(v / size)} ${label}`,
	};
}

const BYTE_UNITS_SI: readonly ScaleUnit[] = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
	.map((label, i) => ({ label, size: 1000 ** i }));
const BYTE_UNITS_IEC: readonly ScaleUnit[] = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB']
	.map((label, i) => ({ label, size: 1024 ** i }));

const COUNT_SUFFIXES: readonly ScaleUnit[] = [
	{ label: '', size: 1 },
	{ label: 'k', size: 1e3 },
	{ label: 'M', size: 1e6 },
	{ label: 'B', size: 1e9 },
	{ label: 'T', size: 1e12 },
];

function formatBase(v: number, formatter?: ValueFormatter): string {
	switch (formatter) {
		case 'percent': {
			const pct = Math.abs(v * 100);
			if (pct > 0 && pct < 0.05) { return signed(v, `${significant(pct)}%`); }
			const oneDecimal = pct.toFixed(1);
			return signed(v, `${Number(oneDecimal) >= 1000 ? groupThousands(pct.toFixed(0)) : oneDecimal}%`);
		}
		case 'ms':
			return v === 0 ? '0 ms' : signed(v, scaled(Math.abs(v), DURATION_UNITS, durationDigits));
		case 'count':
			return signed(v, significant(Math.abs(v)));
		case 'count-si':
			return signed(
				v,
				scaled(Math.abs(v), COUNT_SUFFIXES, (x, i) => (i === 0 ? significant(x) : siDigits(x)), ''),
			);
		case 'cores':
			// Input is cores-equivalent CPU usage (1.0 = one core fully busy;
			// nproc = box saturated). Display direct, no scaling.
			return `${v.toFixed(2)} cores`;
		case 'bytes-si':
		case 'bytes-iec':
			// Adaptive precision: one decimal only where it carries signal
			// (|scaled| < 10, e.g. "1.5 GB"); integers above that ("512 MB")
			// and for exact zero ("0 B"). Matches the rounding the table-size
			// charts always used, now shared by every byte axis/tooltip.
			return signed(
				v,
				scaled(Math.abs(v), formatter === 'bytes-iec' ? BYTE_UNITS_IEC : BYTE_UNITS_SI, scaledDigits),
			);
		default:
			return signed(v, significant(Math.abs(v)));
	}
}

function scaled(
	abs: number,
	units: readonly ScaleUnit[],
	digits: (x: number, unitIndex: number) => string,
	separator = ' ',
): string {
	let i = 0;
	while (i < units.length - 1 && abs >= units[i + 1].size) { i++; }
	let text = digits(abs / units[i].size, i);
	// Rounding can carry into the next unit: 999.96 ms reads "1 s", not "1000 ms".
	if (i < units.length - 1 && Number(text.replaceAll(',', '')) >= units[i + 1].size / units[i].size) {
		i++;
		text = digits(abs / units[i].size, i);
	}
	return `${text}${separator}${units[i].label}`;
}

/** Precision is decided on the rounded value, so 9.96 reads "10", not "10.0". */
function scaledDigits(x: number): string {
	if (x === 0) { return '0'; }
	const oneDecimal = x.toFixed(1);
	return Number(oneDecimal) < 10 ? oneDecimal : groupThousands(x.toFixed(0));
}

function durationDigits(x: number): string {
	return x < 0.1 ? significant(x) : trimPointZero(scaledDigits(x));
}

function siDigits(x: number): string {
	const oneDecimal = x.toFixed(1);
	return Number(oneDecimal) >= 10 ? groupThousands(x.toFixed(0)) : trimPointZero(oneDecimal);
}

function trimPointZero(text: string): string {
	return text.endsWith('.0') ? text.slice(0, -2) : text;
}

function significant(x: number): string {
	if (x === 0 || x >= 100) { return groupThousands(x.toFixed(0)); }
	// toFixed accepts at most 100 digits; anything that small is zero to a reader.
	const decimals = Math.min(100, 2 - Math.floor(Math.log10(x)));
	const text = x.toFixed(decimals);
	return text.includes('.') ? text.replace(/\.?0+$/, '') : text;
}

function groupThousands(digits: string): string {
	return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** No sign on a magnitude that rounded to zero ("-0.0 B"). */
function signed(v: number, text: string): string {
	return v < 0 && /[1-9]/.test(text) ? `-${text}` : text;
}
