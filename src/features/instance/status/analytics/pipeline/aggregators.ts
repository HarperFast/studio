// Aggregators run in the data layer, before primitives mount. Percentile
// implementations use the nearest-rank method: p50 of [10, 20, 30] = 20;
// p50 of [10, 20] = 10 (the lower of two medians). No interpolation. If a
// future spec needs interpolated quantiles, add `p50-interp` etc. to the
// Aggregator union rather than silently changing this behavior.
import type { Aggregator } from '../types/analytics';

export interface AggInput {
	value: number | null;
	/** Required when aggregator === 'count-weighted-mean'; ignored otherwise. */
	count?: number;
}

export function aggregate(op: Aggregator, items: AggInput[]): number | null {
	const finite = items.filter(
		(i): i is AggInput & { value: number } => typeof i.value === 'number' && Number.isFinite(i.value),
	);
	if (finite.length === 0) { return null; }
	const vals = finite.map((i) => i.value);

	switch (op) {
		case 'sum':
			return vals.reduce((a, b) => a + b, 0);
		case 'mean':
			return vals.reduce((a, b) => a + b, 0) / vals.length;
		case 'max': {
			// Reducer instead of Math.max(...vals) — argument-spread blows the
			// V8 stack around ~125k elements, and a single (time, dim) bucket
			// can collect tens of thousands of values when many nodes report
			// at high frequency.
			let m = vals[0];
			for (let i = 1; i < vals.length; i++) {
				if (vals[i] > m) { m = vals[i]; }
			}
			return m;
		}
		case 'min': {
			let m = vals[0];
			for (let i = 1; i < vals.length; i++) {
				if (vals[i] < m) { m = vals[i]; }
			}
			return m;
		}
		case 'last':
			return vals[vals.length - 1];
		case 'p50':
			return percentile(vals, 0.5);
		case 'p95':
			return percentile(vals, 0.95);
		case 'p99':
			return percentile(vals, 0.99);
		case 'count-weighted-mean': {
			let numer = 0;
			let denom = 0;
			for (const item of finite) {
				const c = Number.isFinite(item.count) ? (item.count as number) : 1;
				numer += item.value * c;
				denom += c;
			}
			return denom === 0 ? null : numer / denom;
		}
	}
}

function percentile(vals: number[], p: number): number {
	const sorted = [...vals].sort((a, b) => a - b);
	const idx = Math.max(1, Math.ceil(p * sorted.length));
	return sorted[idx - 1];
}
