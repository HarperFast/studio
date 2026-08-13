import { DirectoryEntry } from '@/features/instance/applications/context/directoryEntry';
import { FileEntry } from '@/features/instance/applications/context/fileEntry';
import {
	LARGE_PACKAGE_BYTES,
	measureProjectPackage,
	packageCaution,
} from '@/features/instance/applications/lib/projectPackageSize';
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

describe('packageCaution', () => {
	const exact = (bytes: number) => ({ bytes, fileCount: 3, exact: true });

	it('stays quiet for a measured, ordinary application', () => {
		expect(packageCaution(exact(24_000), false)).toBeUndefined();
	});

	it('flags a measured application over the threshold as large', () => {
		expect(packageCaution(exact(800_000_000), false)).toBe('large');
	});

	it('treats the threshold as exclusive', () => {
		expect(packageCaution(exact(LARGE_PACKAGE_BYTES), false)).toBeUndefined();
		expect(packageCaution(exact(LARGE_PACKAGE_BYTES + 1), false)).toBe('large');
	});

	it('flags including node modules as large, since the measured total is then only a floor', () => {
		expect(packageCaution(exact(1_000), true)).toBe('large');
	});

	// The hole this function exists to close. An instance that reports no file sizes yields
	// { bytes: 0, exact: false }; comparing that against the threshold reads as "safe", so an
	// 800 MB application would get no warning at all and reproduce the #1591 tab crash.
	it('flags an inexact measurement even though its partial total is under the threshold', () => {
		expect(packageCaution({ bytes: 0, fileCount: 4_213, exact: false }, false)).toBe('unmeasured');
		expect(packageCaution({ bytes: 2_000, fileCount: 4_213, exact: false }, false)).toBe('unmeasured');
	});

	it('flags a project it could not measure at all', () => {
		expect(packageCaution(undefined, false)).toBe('unmeasured');
	});

	// Unmeasured wins over large: the honest message is "we don't know", not a size claim we
	// can't support.
	it('reports unmeasured rather than large when an inexact total is itself over the threshold', () => {
		expect(packageCaution({ bytes: 800_000_000, fileCount: 10, exact: false }, false)).toBe('unmeasured');
	});
});
