import { describe, expect, it } from 'vitest';
import { type AggInput, aggregate } from '../../pipeline/aggregators.ts';

describe('aggregate', () => {
	it('sum', () => {
		expect(aggregate('sum', [{ value: 1 }, { value: 2 }, { value: 3 }])).toBe(6);
	});
	it('mean', () => {
		expect(aggregate('mean', [{ value: 1 }, { value: 2 }, { value: 3 }])).toBe(2);
	});
	it('max', () => {
		expect(aggregate('max', [{ value: 1 }, { value: 7 }, { value: 3 }])).toBe(7);
	});
	it('min', () => {
		expect(aggregate('min', [{ value: 1 }, { value: 7 }, { value: 3 }])).toBe(1);
	});
	it('p50', () => {
		expect(aggregate('p50', [{ value: 10 }, { value: 20 }, { value: 30 }])).toBe(20);
	});
	it('p95 on 100 evenly-spaced values equals 95', () => {
		const items = Array.from({ length: 100 }, (_, i) => ({ value: i + 1 }));
		expect(aggregate('p95', items)).toBe(95);
	});
	it('last preserves input order', () => {
		expect(aggregate('last', [{ value: 1 }, { value: 2 }, { value: 3 }])).toBe(3);
	});
	it('count-weighted-mean: [{10,2},{20,8}] → 18', () => {
		expect(aggregate('count-weighted-mean', [
			{ value: 10, count: 2 },
			{ value: 20, count: 8 },
		])).toBe(18);
	});
	it('count-weighted-mean drops null from both Σ', () => {
		const out = aggregate('count-weighted-mean', [
			{ value: 1, count: 10 },
			{ value: null, count: 5 },
			{ value: 0, count: 5 },
		]);
		expect(typeof out === 'number' && Math.abs(out - 10 / 15) < 1e-9).toBeTruthy();
	});
	it('returns null when all inputs are null', () => {
		expect(aggregate('sum', [{ value: null }, { value: null }])).toBe(null);
	});
	it('returns null for empty input', () => {
		expect(aggregate('sum', [] as AggInput[])).toBe(null);
	});
	it('count-weighted-mean guards NaN/Infinity in item.count', () => {
		const out = aggregate('count-weighted-mean', [
			{ value: 10, count: NaN },
			{ value: 20, count: 10 },
		]);
		// NaN → 1; (10·1 + 20·10) / (1 + 10) = 210/11 ≈ 19.09
		expect(typeof out === 'number' && Math.abs(out - 210 / 11) < 1e-9).toBeTruthy();
	});
});
