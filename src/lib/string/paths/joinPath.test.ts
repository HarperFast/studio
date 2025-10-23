import { joinPath } from '@/lib/string/paths/joinPath';
import { describe, expect, it } from 'vitest';

describe('joinPath', () => {
	it('joins simple string segments with slashes', () => {
		expect(joinPath('a', 'b', 'c')).toBe('a/b/c');
	});

	it('joins when given an array of segments', () => {
		expect(joinPath(['a', 'b', 'c'])).toBe('a/b/c');
	});

	it('joins when mixing arrays and strings', () => {
		expect(joinPath(['a', 'b'], 'c')).toBe('a/b/c');
		expect(joinPath('a', ['b', 'c'])).toBe('a/b/c');
	});

	it('does a shallow (1-level) flatten only', () => {
		// Note: nested arrays are not part of the function type, but
		// this test documents current behavior of Array#flat(1) + join.
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const result = (joinPath as any)(['a', ['b']], 'c');
		expect(result).toBe('a/b/c');
	});

	it('preserves empty segments (does not normalize)', () => {
		expect(joinPath('a', '', 'c')).toBe('a//c');
	});

	it('preserves leading/trailing slashes in segments', () => {
		expect(joinPath('/a', 'b')).toBe('/a/b');
		expect(joinPath('a/', 'b')).toBe('a//b');
		expect(joinPath('a', 'b/')).toBe('a/b/');
		expect(joinPath('/a/', '/b/')).toBe('/a///b/');
	});

	it('returns empty string when called with no arguments', () => {
		expect(joinPath()).toBe('');
	});
});
