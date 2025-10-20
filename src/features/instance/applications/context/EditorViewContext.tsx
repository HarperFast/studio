import { SetComponentFileRequest } from '@/features/instance/operations/mutations/updateComponentFile';
import { createContext } from 'react';
import { DirectoryEntry } from './directoryEntry';
import { FileEntry } from './fileEntry';

export type EditorViewContextValue = {
	rootEntries: Array<DirectoryEntry | FileEntry>;

	openedEntry: DirectoryEntry | FileEntry | null;
	setOpenedEntry: (entry: DirectoryEntry | FileEntry | null) => void;

	openedEntryContents: string | null;
	setOpenedEntryContents: (contents: string | null) => void;

	saveFile: (data: SetComponentFileRequest, filePath: string) => void;
	isSavingFile: boolean;
};

export const EditorViewContext = createContext<EditorViewContextValue | null>(null);
