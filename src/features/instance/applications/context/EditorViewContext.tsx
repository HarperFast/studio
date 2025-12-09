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

	focusedItem: TreeItemIndex | undefined;
	setFocusedItem: (
		entry: TreeItemIndex | undefined | ((prevState: TreeItemIndex | undefined) => TreeItemIndex | undefined),
	) => void;
	expandedItems: TreeItemIndex[];
	setExpandedItems: (entries: TreeItemIndex[] | ((prevState: TreeItemIndex[]) => TreeItemIndex[])) => void;
	selectedItems: TreeItemIndex[];
	setSelectedItems: (entries: TreeItemIndex[] | ((prevState: TreeItemIndex[]) => TreeItemIndex[])) => void;

	saveFile: (data: SetComponentFileRequest, filePath: string) => void;
	isSavingFile: boolean;
};

export const EditorViewContext = createContext<EditorViewContextValue | null>(null);
