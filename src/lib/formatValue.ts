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
 * prose-oriented — they round to integers and insert locale group separators
 * via Intl ("1,234 MB"), which is right for body copy but wrong for axis
 * ticks, where compact fixed-precision short forms ("1.2 GB", "50k") keep
 * tick labels aligned and unambiguous at small font sizes.
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

function formatBase(v: number, formatter?: ValueFormatter): string {
	switch (formatter) {
		case 'percent':
			return `${(v * 100).toFixed(1)}%`;
		case 'ms':
			return `${v.toFixed(1)} ms`;
		case 'count':
			return `${v.toFixed(0)}`;
		case 'count-si': {
			const abs = Math.abs(v);
			if (abs < 1_000) { return `${v}`; }
			const sign = v < 0 ? '-' : '';
			const fmt = (x: number): string => {
				if (x >= 10) { return `${Math.round(x)}`; }
				const s = x.toFixed(1);
				return s.endsWith('.0') ? s.slice(0, -2) : s;
			};
			if (abs < 1_000_000) { return `${sign}${fmt(abs / 1_000)}k`; }
			if (abs < 1_000_000_000) { return `${sign}${fmt(abs / 1_000_000)}M`; }
			return `${sign}${fmt(abs / 1_000_000_000)}B`;
		}
		case 'cores':
			// Input is cores-equivalent CPU usage (1.0 = one core fully busy;
			// nproc = box saturated). Display direct, no scaling.
			return `${v.toFixed(2)} cores`;
		case 'bytes-si':
		case 'bytes-iec': {
			const base = formatter === 'bytes-iec' ? 1024 : 1000;
			const units = formatter === 'bytes-iec'
				? ['B', 'KiB', 'MiB', 'GiB', 'TiB']
				: ['B', 'KB', 'MB', 'GB', 'TB'];
			let scaled = v;
			let i = 0;
			while (Math.abs(scaled) >= base && i < units.length - 1) {
				scaled /= base;
				i++;
			}
			// Adaptive precision: one decimal only where it carries signal
			// (|scaled| < 10, e.g. "1.5 GB"); integers above that ("512 MB")
			// and for exact zero ("0 B"). Matches the rounding the table-size
			// charts always used, now shared by every byte axis/tooltip.
			const digits = scaled !== 0 && Math.abs(scaled) < 10 ? 1 : 0;
			return `${scaled.toFixed(digits)} ${units[i]}`;
		}
		default:
			return `${v}`;
	}
}
