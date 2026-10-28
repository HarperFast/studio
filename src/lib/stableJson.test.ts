import { describe, expect, it } from 'vitest';
import { stableJson } from './stableJson';

describe('stableJson', () => {
	it('serializes equal values identically whatever their key order', () => {
		expect(stableJson({ b: 1, a: { d: [2, { f: 3, e: 4 }], c: null } })).toBe(
			stableJson({ a: { c: null, d: [2, { e: 4, f: 3 }] }, b: 1 }),
		);
	});

	it('keeps array order, which is meaningful', () => {
		expect(stableJson(['TRACE', 'TRACK'])).not.toBe(stableJson(['TRACK', 'TRACE']));
	});

	it('writes undefined as null', () => {
		expect(stableJson(undefined)).toBe('null');
	});
});
