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

	const directoryIds: string[] = [];
	const fileIds: string[] = [];
	for (const entry of rootEntries) {
		if (isDirectory(entry)) {
			directoryIds.push(entry.path);
		} else {
			fileIds.push(entry.path);
		}
		addEntry(items, entry);
	}

	items[rootId] = {
		index: rootId,
		isFolder: true,
		children: [...directoryIds, ...fileIds],
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
		const childDirectoryIds: string[] = [];
		const childFileIds: string[] = [];
		for (const childEntry of dir.entries) {
			if (isDirectory(childEntry)) {
				childDirectoryIds.push(childEntry.path);
			} else {
				childFileIds.push(childEntry.path);
			}
		}
		items[index] = { index, isFolder: true, children: [...childDirectoryIds, ...childFileIds], data: entry };
		for (const child of dir.entries) {
			addEntry(items, child);
		}
	} else {
		items[index] = { index, isFolder: false, data: entry };
	}
}
