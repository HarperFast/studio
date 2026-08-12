import { DirectoryEntry } from '@/features/instance/applications/context/directoryEntry';
import { FileEntry } from '@/features/instance/applications/context/fileEntry';
import { isDirectory } from '@/features/instance/applications/context/isDirectory';
import { APIDirectoryEntry, APIFileEntry } from '@/integrations/api/instance/applications/getComponents';
import { transformNodes } from '@/lib/arrays/transformNodes';

export function calculateRootEntries(entries: Array<APIDirectoryEntry | APIFileEntry>): {
	rootEntries: Array<DirectoryEntry | FileEntry>;
	pathsRegistry: Set<string>;
} {
	const pathsRegistry = new Set<string>();
	const rootEntries = transformNodes(
		entries || [],
		'entries',
		(node: APIFileEntry | APIDirectoryEntry, parents: APIDirectoryEntry[]) => {
			const readMeAPIFile = isDirectory(node) && node.entries.find(e => e.name.toLowerCase() === 'readme.md');
			const path = [...parents.map(p => p.name), node.name].join('/');
			pathsRegistry.add(path);
			return {
				name: node.name,
				path,
				// Carried through from the API entry rather than dropped: the download modal sizes a
				// package by summing these off the tree (see measureProjectPackage), and this
				// transformer rebuilds each node from scratch, so anything not named here is lost.
				size: node.size,
				project: (parents[0] || node)?.name,
				package: (parents[0] || node)?.package,
				overviewEntry: readMeAPIFile && !isDirectory(readMeAPIFile) && {
							name: readMeAPIFile.name,
							path: [...parents.map(p => p.name), node.name, readMeAPIFile.name].join('/'),
							project: (parents[0] || node)?.name,
							package: (parents[0] || node)?.package,
						} || undefined,
			} satisfies DirectoryEntry | FileEntry;
		},
	);
	return {
		rootEntries,
		pathsRegistry,
	};
}
