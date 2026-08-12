/**
 * `calculateRootEntries` rebuilds every node from scratch rather than spreading the API entry,
 * so any field it doesn't name explicitly is silently dropped. That already bit once: `size`
 * was missing, and the download modal reported "At least 0 B across 159 files" against a real
 * instance that was sending a size on every file (HarperFast/studio#1591). Nothing about that
 * failure is visible from types — the field is optional — so it needs a test to stay fixed.
 */
import { calculateRootEntries } from '@/features/instance/applications/components/ApplicationsSidebar/calculateRootEntries';
import { DirectoryEntry } from '@/features/instance/applications/context/directoryEntry';
import { FileEntry } from '@/features/instance/applications/context/fileEntry';
import { isDirectory } from '@/features/instance/applications/context/isDirectory';
import { APIDirectoryEntry } from '@/integrations/api/instance/applications/getComponents';
import { describe, expect, it } from 'vitest';

const TREE: APIDirectoryEntry[] = [
	{
		name: 'my-app',
		entries: [
			{ name: 'package.json', size: 100 },
			{ name: 'README.md', size: 200 },
			{
				name: 'src',
				entries: [{ name: 'index.js', size: 900 }],
			} as APIDirectoryEntry,
		],
	} as APIDirectoryEntry,
];

type AnyEntry = DirectoryEntry | FileEntry;

/** Depth-first lookup by the `path` the transformer assigns. */
function at(entries: AnyEntry[], path: string): AnyEntry | undefined {
	for (const entry of entries) {
		if (entry.path === path) {
			return entry;
		}
		if (isDirectory(entry)) {
			const found = at(entry.entries, path);
			if (found) {
				return found;
			}
		}
	}
	return undefined;
}

describe('calculateRootEntries', () => {
	it('carries each file size through to the transformed tree', () => {
		const { rootEntries } = calculateRootEntries(TREE);

		expect(at(rootEntries, 'my-app/package.json')?.size).toBe(100);
		// Nested a level down, where the transformer recurses — the case the modal actually sums.
		expect(at(rootEntries, 'my-app/src/index.js')?.size).toBe(900);
	});

	it('leaves size undefined when the API entry has none, rather than inventing a zero', () => {
		const { rootEntries } = calculateRootEntries([
			{ name: 'my-app', entries: [{ name: 'mystery.bin' }] } as APIDirectoryEntry,
		]);

		expect(at(rootEntries, 'my-app/mystery.bin')?.size).toBeUndefined();
	});

	it('builds nested paths and attributes every entry to its top-level project', () => {
		const { rootEntries, pathsRegistry } = calculateRootEntries(TREE);

		expect(at(rootEntries, 'my-app/src/index.js')?.project).toBe('my-app');
		expect(pathsRegistry.has('my-app/src/index.js')).toBe(true);
		expect(pathsRegistry.has('my-app')).toBe(true);
	});

	it('attaches a directory README as its overview entry', () => {
		const { rootEntries } = calculateRootEntries(TREE);
		const root = at(rootEntries, 'my-app');

		expect(isDirectory(root) && root.overviewEntry?.path).toBe('my-app/README.md');
	});
});
