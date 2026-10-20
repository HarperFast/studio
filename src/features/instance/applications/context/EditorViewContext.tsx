import { APIDirectoryEntry } from '@/integrations/api/instance/applications/getComponents';
import { SetComponentFileRequest } from '@/integrations/api/instance/applications/setComponentFile';
import { createContext } from 'react';
import { TreeItemIndex } from 'react-complex-tree/src/types';
import { DirectoryEntry } from './directoryEntry';
import { FileEntry } from './fileEntry';

export type EditorViewContextValue = {
	rootEntries: Array<DirectoryEntry | FileEntry>;
	reloadRootEntries: () => Promise<APIDirectoryEntry>;
	entryExists: (path: string) => boolean;

	openedEntry: DirectoryEntry | FileEntry | undefined;
	setOpenedEntry: (entry: DirectoryEntry | FileEntry | undefined) => void;

	restrictPackageModification: boolean;
	openedEntryContents: string | undefined;
	setOpenedEntryContents: (
		contents: (string | undefined) | ((existingContents: string | undefined) => string | undefined),
	) => void;
	/** Reading the opened entry's contents failed: `openedEntryContents` stays unknown until a read succeeds. */
	openedEntryReadFailed: boolean;

	focusedItem: TreeItemIndex | undefined;
	setFocusedItem: (
		entry: TreeItemIndex | undefined | ((prevState: TreeItemIndex | undefined) => TreeItemIndex | undefined),
	) => void;
	expandedItems: TreeItemIndex[];
	setExpandedItems: (entries: TreeItemIndex[] | ((prevState: TreeItemIndex[]) => TreeItemIndex[])) => void;
	selectedItems: TreeItemIndex[];
	setSelectedItems: (entries: TreeItemIndex[] | ((prevState: TreeItemIndex[]) => TreeItemIndex[])) => void;

	/** Refused while a save of the same file is in flight; another file saves alongside it. */
	saveFile: (data: SetComponentFileRequest) => void;
	/** `saveFile` for a caller that reports the outcome itself: rejects when refused or failed. */
	writeFile: (data: SetComponentFileRequest) => Promise<void>;
	isSavingFile: boolean;
	isSavingAnyFile: boolean;
};

export const EditorViewContext = createContext<EditorViewContextValue | null>(null);
