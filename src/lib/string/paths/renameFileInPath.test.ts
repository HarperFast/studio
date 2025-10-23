import { renameFileInPath } from '@/lib/string/paths/renameFileInPath';
import { describe, expect, it } from 'vitest';

describe('renameFileInPath', () => {
	it('renames the file at the end of a nested path', () => {
		expect(renameFileInPath('a/b/c.txt', 'd.ts')).toBe('a/b/d.ts');
	});

	it('preserves directory structure when renaming', () => {
		expect(renameFileInPath('/a/b', 'c')).toBe('/a/c');
	});

	it('keeps double slashes in directories as-is', () => {
		expect(renameFileInPath('a//b', 'c')).toBe('a//c');
	});

	it('if original path has trailing slash, it is removed before appending new file name', () => {
		expect(renameFileInPath('a/b/c/', 'd')).toBe('a/b/c/d');
	});

	it('when original is a single segment, results in a leading slash before new name (current behavior)', () => {
		expect(renameFileInPath('file', 'new')).toBe('/new');
	});

	it('empty original path produces leading slash before new name (current behavior)', () => {
		expect(renameFileInPath('', 'new')).toBe('/new');
	});

	it('empty new file name results in a trailing slash after directory path (current behavior)', () => {
		expect(renameFileInPath('a/b/c', '')).toBe('a/b/');
	});
});
