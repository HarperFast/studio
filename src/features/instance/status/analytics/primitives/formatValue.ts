import type { AxisSpec } from '../types/analytics.ts';

export function formatValue(
	v: number,
	formatter?: AxisSpec['formatter'],
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

function formatBase(v: number, formatter?: AxisSpec['formatter']): string {
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
			return `${scaled.toFixed(1)} ${units[i]}`;
		}
		default:
			return `${v}`;
	}
}
