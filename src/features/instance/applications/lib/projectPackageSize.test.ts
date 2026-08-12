import { DirectoryEntry } from '@/features/instance/applications/context/directoryEntry';
import { FileEntry } from '@/features/instance/applications/context/fileEntry';
import { LARGE_PACKAGE_BYTES, measureProjectPackage } from '@/features/instance/applications/lib/projectPackageSize';
import { describe, expect, it } from 'vitest';

function file(name: string, size?: number): FileEntry {
	return { name, path: `app/${name}`, project: 'app', size } as FileEntry;
}

function dir(name: string, entries: Array<DirectoryEntry | FileEntry>): DirectoryEntry {
	return { name, path: name, project: name, entries } as DirectoryEntry;
}

describe('measureProjectPackage', () => {
	it('sums every file under the project, at any depth', () => {
		const tree = [
			dir('app', [
				file('package.json', 100),
				dir('src', [file('index.js', 900), dir('deep', [file('nested.js', 1_000)])]),
			]),
		];

		expect(measureProjectPackage(tree, 'app')).toEqual({ bytes: 2_000, fileCount: 3, exact: true });
	});

	it('ignores other projects in the tree', () => {
		const tree = [
			dir('app', [file('index.js', 10)]),
			dir('other', [file('huge.bin', 999_999)]),
		];

		expect(measureProjectPackage(tree, 'app')?.bytes).toBe(10);
	});

	it('reports an inexact total when a file entry carries no size', () => {
		const tree = [dir('app', [file('sized.js', 40), file('unsized.js', undefined)])];

		expect(measureProjectPackage(tree, 'app')).toEqual({ bytes: 40, fileCount: 2, exact: false });
	});

	it('counts an empty project as zero rather than undefined', () => {
		expect(measureProjectPackage([dir('app', [])], 'app')).toEqual({ bytes: 0, fileCount: 0, exact: true });
	});

	// Undefined is the "say nothing" signal for the modal — distinct from a real zero, which
	// would otherwise render as a confident "About 0 B".
	it('returns undefined when the project is absent from the tree', () => {
		expect(measureProjectPackage([dir('other', [file('a.js', 1)])], 'app')).toBeUndefined();
	});

	it('returns undefined when no project is opened', () => {
		expect(measureProjectPackage([dir('app', [file('a.js', 1)])], undefined)).toBeUndefined();
	});

	it('returns undefined when the named entry is a file, not a project directory', () => {
		expect(measureProjectPackage([file('app', 10)], 'app')).toBeUndefined();
	});

	// The case that produced HarperFast/studio#1591: ~800 MB of application, no node_modules.
	it('puts a #1591-sized application over the warning threshold', () => {
		const tree = [dir('app', [file('assets.bin', 800_000_000)])];

		expect(measureProjectPackage(tree, 'app')!.bytes).toBeGreaterThan(LARGE_PACKAGE_BYTES);
	});

	it('leaves an ordinary application under the warning threshold', () => {
		const tree = [dir('app', [file('index.js', 20_000), file('README.md', 4_000)])];

		expect(measureProjectPackage(tree, 'app')!.bytes).toBeLessThan(LARGE_PACKAGE_BYTES);
	});
});
