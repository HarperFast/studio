import { extractFileNameFromPath } from '@/lib/string/paths/extractFileNameFromPath';
import { describe, expect, it } from 'vitest';

describe('extractFileNameFromPath', () => {
	it('returns the last segment for a typical nested path', () => {
		expect(extractFileNameFromPath('a/b/c.txt')).toBe('c.txt');
	});

	it('returns the input when there is only a single segment', () => {
		expect(extractFileNameFromPath('file')).toBe('file');
	});

	it('handles leading slashes', () => {
		expect(extractFileNameFromPath('/a/b')).toBe('b');
	});

	it('handles double slashes within path (keeps last non-empty)', () => {
		expect(extractFileNameFromPath('a//b')).toBe('b');
	});

	it('returns empty string for trailing slash paths', () => {
		expect(extractFileNameFromPath('a/b/c/')).toBe('');
	});

	it('returns empty string for empty input', () => {
		expect(extractFileNameFromPath('')).toBe('');
	});
});
