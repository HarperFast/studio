import type { DirectoryEntry } from '@/features/instance/applications/context/directoryEntry';
import type { FileEntry } from '@/features/instance/applications/context/fileEntry';
import { isDirectory } from '@/features/instance/applications/context/isDirectory';
import type { TreeItem } from 'react-complex-tree';

export function buildItems(rootEntries: Array<DirectoryEntry | FileEntry>): {
	items: Record<string, TreeItem<DirectoryEntry | FileEntry | null>>;
	rootId: string
} {
	const items: Record<string, TreeItem<DirectoryEntry | FileEntry | null>> = {};
	const rootId = '__root__';

	const childIds: string[] = [];
	for (const entry of rootEntries) {
		childIds.push(entry.path);
		addEntry(items, entry);
	}

	items[rootId] = {
		index: rootId,
		isFolder: true,
		children: childIds,
		data: null,
	};

	return { items, rootId };
}

function addEntry(
	items: Record<string, TreeItem<DirectoryEntry | FileEntry | null>>,
	entry: DirectoryEntry | FileEntry,
) {
	const index = entry.path;
	if (isDirectory(entry)) {
		const dir = entry as DirectoryEntry;
		const children = dir.entries.map((e) => e.path);
		items[index] = { index, isFolder: true, children, data: entry };
		for (const child of dir.entries) {
			addEntry(items, child);
		}
	} else {
		items[index] = { index, isFolder: false, data: entry };
	}
}
