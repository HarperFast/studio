import { describe, expect, it } from 'vitest';
import { buildReadLogBody, clampReadLogLimit, MAX_READ_LOG_LIMIT } from './getReadLog';

describe('clampReadLogLimit', () => {
	it('returns undefined for blank or invalid input', () => {
		expect(clampReadLogLimit(undefined)).toBeUndefined();
		expect(clampReadLogLimit(null)).toBeUndefined();
		expect(clampReadLogLimit('')).toBeUndefined();
		expect(clampReadLogLimit('abc')).toBeUndefined();
		expect(clampReadLogLimit('0')).toBeUndefined();
		expect(clampReadLogLimit('-5')).toBeUndefined();
	});

	it('passes values at or below the ceiling through unchanged', () => {
		expect(clampReadLogLimit('100')).toBe(100);
		expect(clampReadLogLimit(String(MAX_READ_LOG_LIMIT))).toBe(MAX_READ_LOG_LIMIT);
	});

	it('clamps values above the ceiling', () => {
		expect(clampReadLogLimit('999999')).toBe(MAX_READ_LOG_LIMIT);
	});
});

describe('buildReadLogBody', () => {
	it('clamps an oversized limit before it reaches the wire', () => {
		expect(buildReadLogBody({ limit: '5000000' }, false).limit).toBe(MAX_READ_LOG_LIMIT);
	});

	it('omits limit entirely when the field is blank', () => {
		expect(buildReadLogBody({ limit: '' }, false).limit).toBeUndefined();
	});
});
