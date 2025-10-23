import { removeFileNameFromPath } from '@/lib/string/paths/removeFileNameFromPath';
import { describe, expect, it } from 'vitest';

describe('removeFileNameFromPath', () => {
	it('removes the last segment from a nested path', () => {
		expect(removeFileNameFromPath('a/b/c.txt')).toBe('a/b');
	});

	it('returns empty string when there is only a single segment', () => {
		expect(removeFileNameFromPath('file')).toBe('');
	});

	it('handles leading slashes, preserving them in the directory path', () => {
		expect(removeFileNameFromPath('/a/b')).toBe('/a');
	});

	it('handles double slashes by preserving empty segments', () => {
		expect(removeFileNameFromPath('a//b')).toBe('a/');
	});

	it('drops the trailing slash when input ends with a slash', () => {
		expect(removeFileNameFromPath('a/b/c/')).toBe('a/b/c');
	});

	it('returns empty string for empty input', () => {
		expect(removeFileNameFromPath('')).toBe('');
	});

	it('removing from a root path like "/file" yields empty (no dir portion)', () => {
		expect(removeFileNameFromPath('/file')).toBe('');
	});
});
