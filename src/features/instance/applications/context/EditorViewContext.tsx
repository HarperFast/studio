import { createContext } from 'react';
import { SetComponentFileRequest } from '../../operations/mutations/updateComponentFile';
import { DirectoryEntry, HandleFileSelectParams } from '../../operations/queries/getComponents';

export type EditorViewContextValue = {
	selectedFolderFile: HandleFileSelectParams;
	hasProjects?: boolean;
	canAddFile?: boolean;
	canDeleteFolder?: boolean;
	isFolder: (entry: DirectoryEntry[] | undefined) => boolean;
	handleFileSelect: (params: HandleFileSelectParams) => void;
	onSaveFile: (data: SetComponentFileRequest, filePath: string) => void;
	isSavingFile: boolean;
};

export const EditorViewContext = createContext<EditorViewContextValue | null>(null);
