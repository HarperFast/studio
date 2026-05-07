import { describe, expect, it } from 'vitest';
import { evalFieldExpr } from '../../pipeline/fieldExpr.ts';
import type { FieldExpr } from '../../types/analytics.ts';

const record = {
	count: 100,
	mean: 2.5,
	period: 60000,
	voluntaryContextSwitches: 800,
	involuntaryContextSwitches: 200,
};

describe('evalFieldExpr', () => {
	it('ref returns the raw field', () => {
		expect(evalFieldExpr({ kind: 'ref', field: 'count' }, record)).toBe(100);
	});

	it('const returns the literal', () => {
		expect(evalFieldExpr({ kind: 'const', value: 3.14 }, record)).toBe(3.14);
	});

	it('op: multiplies count by mean (bytes-sent style)', () => {
		const expr: FieldExpr = {
			kind: 'op',
			op: '*',
			left: { kind: 'ref', field: 'count' },
			right: { kind: 'ref', field: 'mean' },
		};
		expect(evalFieldExpr(expr, record)).toBe(250);
	});

	it('op: sums two refs (context-switches style)', () => {
		const expr: FieldExpr = {
			kind: 'op',
			op: '+',
			left: { kind: 'ref', field: 'voluntaryContextSwitches' },
			right: { kind: 'ref', field: 'involuntaryContextSwitches' },
		};
		expect(evalFieldExpr(expr, record)).toBe(1000);
	});

	it('returns null when a ref resolves to non-number', () => {
		expect(evalFieldExpr({ kind: 'ref', field: 'missing' }, record)).toBe(null);
	});

	it('propagates null through op (null + 1 = null)', () => {
		const expr: FieldExpr = {
			kind: 'op',
			op: '+',
			left: { kind: 'ref', field: 'missing' },
			right: { kind: 'const', value: 1 },
		};
		expect(evalFieldExpr(expr, record)).toBe(null);
	});

	it('divide by zero returns null (not Infinity)', () => {
		const expr: FieldExpr = {
			kind: 'op',
			op: '/',
			left: { kind: 'const', value: 1 },
			right: { kind: 'const', value: 0 },
		};
		expect(evalFieldExpr(expr, record)).toBe(null);
	});
});
