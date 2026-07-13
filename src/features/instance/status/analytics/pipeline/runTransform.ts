import type { Transform } from '../types/analytics';
import { type NamedTransformKey, namedTransforms } from './transforms';

/** Apply a Transform to a scalar. `period` is the record's period in ms; only
 *  `rate` consults it. Null input short-circuits to null. The pipeline resolves
 *  missing/invalid record periods to the spec's bucket fallback before calling
 *  this (see `resolvePeriod` in pipeline.ts), so the non-positive guard on
 *  `rate` is a backstop for direct callers, not a drop path in practice. */
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
		default: {
			// Exhaustiveness check — adding a new Transform kind without handling
			// it here will fail typechecking on this assignment.
			const _exhaustive: never = transform;
			throw new Error(`unknown transform kind: ${(_exhaustive as { kind: string }).kind}`);
		}
	}
}
