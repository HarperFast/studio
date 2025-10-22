import { SetComponentFileRequest } from '@/features/instance/operations/mutations/setComponentFile';
import { createContext } from 'react';
import { TreeItemIndex } from 'react-complex-tree/src/types';
import { DirectoryEntry } from './directoryEntry';
import { FileEntry } from './fileEntry';

export type EditorViewContextValue = {
	rootEntries: Array<DirectoryEntry | FileEntry>;
	reloadRootEntries: () => void;

	openedEntry: DirectoryEntry | FileEntry | null;
	setOpenedEntry: (entry: DirectoryEntry | FileEntry | null) => void;

	openedEntryContents: string | null;
	setOpenedEntryContents: (contents: string | null) => void;

	focusedItem: TreeItemIndex | undefined,
	setFocusedItem: (entry: TreeItemIndex | undefined | ((prevState: TreeItemIndex | undefined) => TreeItemIndex | undefined)) => void,
	expandedItems: TreeItemIndex[],
	setExpandedItems: (entries: TreeItemIndex[] | ((prevState: TreeItemIndex[]) => TreeItemIndex[])) => void,
	selectedItems: TreeItemIndex[],
	setSelectedItems: (entries: TreeItemIndex[] | ((prevState: TreeItemIndex[]) => TreeItemIndex[])) => void,

	saveFile: (data: SetComponentFileRequest, filePath: string) => void;
	isSavingFile: boolean;
};

export const EditorViewContext = createContext<EditorViewContextValue | null>(null);
