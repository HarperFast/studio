import type { Transform } from '../types/analytics.ts';
import { type NamedTransformKey, namedTransforms } from './transforms.ts';

/** Apply a Transform to a scalar. `period` is the record's `period` field in
 *  ms; only `rate` consults it. Null input short-circuits to null. */
export function runTransform(
	transform: Transform,
	value: number | null,
	period: number,
): number | null {
	if (value === null) { return null; }
	switch (transform.kind) {
		case 'raw':
			return value;
		case 'scale':
			return value * transform.factor;
		case 'rate':
			if (!Number.isFinite(period) || period <= 0) { return null; }
			return (value / period) * 1000;
		case 'ratio':
			return value;
		case 'compose': {
			let v: number | null = value;
			for (const step of transform.steps) {
				v = runTransform(step, v, period);
				if (v === null) { return null; }
			}
			return v;
		}
		case 'named': {
			const fn = namedTransforms[transform.name as NamedTransformKey];
			if (!fn) { throw new Error(`unknown named transform: ${transform.name}`); }
			return fn(value);
		}
	}
}
