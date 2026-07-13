import { describe, expect, it } from 'vitest';
import { classifyConfidence } from '../../pipeline/confidence';

describe('classifyConfidence (post-aggregation windowed count)', () => {
	const rule = { greyBelow: 40, suppressBelow: 100 };

	it('100 passes (boundary: ok)', () => {
		expect(classifyConfidence(100, rule)).toBe('ok');
	});
	it('99 is grey (between greyBelow and suppressBelow)', () => {
		expect(classifyConfidence(99, rule)).toBe('grey');
	});
	it('40 is grey (boundary)', () => {
		expect(classifyConfidence(40, rule)).toBe('grey');
	});
	it('39 is suppressed (boundary)', () => {
		expect(classifyConfidence(39, rule)).toBe('suppress');
	});
	it('0 suppresses', () => {
		expect(classifyConfidence(0, rule)).toBe('suppress');
	});
	it('no rule → always ok', () => {
		expect(classifyConfidence(1, undefined)).toBe('ok');
	});
	it('count=undefined with rule → suppress', () => {
		expect(classifyConfidence(undefined, rule)).toBe('suppress');
	});
});

describe('classifyConfidence asymmetric-default edge cases', () => {
	it('only suppressBelow set → grey tier disabled (count=50 with suppressBelow=100 suppresses)', () => {
		expect(classifyConfidence(50, { suppressBelow: 100 })).toBe('suppress');
	});
	it('only greyBelow set → suppress tier disabled (count=50 with greyBelow=40 is ok)', () => {
		expect(classifyConfidence(50, { greyBelow: 40 })).toBe('ok');
	});
	it('only greyBelow set, below it → grey (count=30 with greyBelow=40 is grey)', () => {
		expect(classifyConfidence(30, { greyBelow: 40 })).toBe('grey');
	});
});
