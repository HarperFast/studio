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
		const result = (joinPath as any)(['a', ['b']], 'c');
		expect(result).toBe('a/b/c');
	});

	it('deduplicates adjacent slashes', () => {
		expect(joinPath('a', '', 'c')).toBe('a//c');
		expect(joinPath('a/', 'b')).toBe('a/b');
		expect(joinPath('/a/', '/b/')).toBe('/a/b/');
	});

	it('preserves boundary slashes', () => {
		expect(joinPath('/a', 'b')).toBe('/a/b');
		expect(joinPath('a', 'b/')).toBe('a/b/');
	});

	it('preserves :// in URLs', () => {
		expect(joinPath('https://example.com/', '/foo/', '/bar/')).toBe('https://example.com/foo/bar/');
	});

	it('returns empty string when called with no arguments', () => {
		expect(joinPath()).toBe('');
	});
});
