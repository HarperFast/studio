import { describe, expect, it } from 'vitest';
import { runTransform } from '../../pipeline/runTransform.ts';
import type { Transform } from '../../types/analytics.ts';

describe('runTransform', () => {
	it('raw returns input unchanged', () => {
		expect(runTransform({ kind: 'raw' }, 42, 60000)).toBe(42);
	});
	it('scale multiplies by factor', () => {
		expect(runTransform({ kind: 'scale', factor: 100 }, 0.5, 60000)).toBe(50);
	});
	it('rate divides by period in seconds', () => {
		expect(runTransform({ kind: 'rate' }, 60_000, 60_000)).toBe(1000);
	});
	it('rate returns null when period <= 0', () => {
		expect(runTransform({ kind: 'rate' }, 100, 0)).toBe(null);
		expect(runTransform({ kind: 'rate' }, 100, -5)).toBe(null);
	});
	it('ratio passes through', () => {
		expect(runTransform({ kind: 'ratio' }, 0.42, 60000)).toBe(0.42);
	});
	it('compose chains left-to-right', () => {
		const t: Transform = {
			kind: 'compose',
			steps: [
				{ kind: 'scale', factor: 2 },
				{ kind: 'scale', factor: 3 },
			],
		};
		expect(runTransform(t, 5, 60000)).toBe(30);
	});
	it('named looks up the registry', () => {
		expect(runTransform({ kind: 'named', name: 'percent-of-core' }, 0.5, 60000)).toBe(50);
	});
	it('throws on unknown named transform', () => {
		expect(() => runTransform({ kind: 'named', name: 'nope' }, 1, 60000)).toThrow(/unknown named transform: nope/);
	});
	it('null input stays null', () => {
		expect(runTransform({ kind: 'scale', factor: 2 }, null, 60000)).toBe(null);
	});
});
