import type { DirectoryEntry } from '@/features/instance/applications/context/directoryEntry';
import type { FileEntry } from '@/features/instance/applications/context/fileEntry';
import { isDirectory } from '@/features/instance/applications/context/isDirectory';
import type { TreeItem } from 'react-complex-tree';
import { importedApplications, newApplication, rootId } from './specialItems';

export function buildItems(rootEntries: Array<DirectoryEntry | FileEntry>): {
	items: Record<string, TreeItem<DirectoryEntry | FileEntry | undefined>>;
	rootId: string
} {
	const items: Record<string, TreeItem<DirectoryEntry | FileEntry | undefined>> = {};

	const directoryIds: string[] = [];
	const applicationIds: string[] = [];
	const fileIds: string[] = [];
	for (const entry of rootEntries) {
		if (isDirectory(entry)) {
			if (entry.package) {
				applicationIds.push(entry.path);
			} else {
				directoryIds.push(entry.path);
			}
		} else {
			fileIds.push(entry.path);
		}
		addEntry(items, entry);
	}

	items[rootId] = {
		index: rootId,
		isFolder: true,
		children: [newApplication, importedApplications, ...directoryIds, ...fileIds],
		data: undefined,
		canMove: false,
		canRename: false,
	} satisfies TreeItem<undefined>;

	items[importedApplications] = {
		index: importedApplications,
		isFolder: true,
		children: applicationIds,
		data: {
			name: 'Imported Applications',
			path: importedApplications,
			package: importedApplications,
			project: '',
			entries: [],
		},
		canMove: false,
		canRename: false,
	} satisfies TreeItem<DirectoryEntry>;

	items[newApplication] = {
		index: newApplication,
		isFolder: false,
		data: {
			name: 'New Application',
			path: newApplication,
			project: '',
		},
		canMove: false,
		canRename: false,
	} satisfies TreeItem<FileEntry>;

	return { items, rootId };
}

function addEntry(
	items: Record<string, TreeItem<DirectoryEntry | FileEntry | undefined>>,
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
		items[index] = {
			index,
			isFolder: true,
			children: [...childDirectoryIds, ...childFileIds],
			data: entry,
			canMove: false,
			canRename: false,
		} satisfies TreeItem<DirectoryEntry>;
		for (const child of dir.entries) {
			addEntry(items, child);
		}
	} else {
		items[index] = {
			index,
			isFolder: false,
			data: entry,
			canMove: !entry.package,
			canRename: !entry.package,
		} satisfies TreeItem<FileEntry>;
	}
}
