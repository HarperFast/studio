import { useQuery } from '@tanstack/react-query';
import { createContext, PropsWithChildren, useEffect, useMemo, useState, useCallback } from 'react';
import { getComponentFileQuery } from '../../operations/queries/getComponentFile';
import { DirectoryEntry } from '../../operations/queries/getComponents';
import { SetComponentFileRequest, useUpdateComponentFile } from '../../operations/mutations/updateComponentFile';
import { toast } from 'sonner';
import { getRouteApi } from '@tanstack/react-router';

type HandleFileSelectParams = {
	filePath: string;
	projectName: string;
	content?: string; // Made optional to allow for state without content i.e. handleFileSelect()
	entries?: DirectoryEntry[]; // Optional entries for directory entries
};

export type EditorViewContextValue = {
	selectedFolderFile: HandleFileSelectParams;
	hasProjects?: boolean;
	canAddFile?: boolean;
	canDeleteFolder?: boolean;
	isFolder: (entry: DirectoryEntry[] | undefined) => boolean;
	handleFileSelect: (params: HandleFileSelectParams) => void;
	updateEditorContent?: (content: string) => void;
	onSaveFile: (data: SetComponentFileRequest) => void;
	isSavingFile: boolean;
};

export const EditorViewContext = createContext<EditorViewContextValue | null>(null);
const route = getRouteApi('');

const isFolder = (entries?: DirectoryEntry[]) => Boolean(entries);

export const EditorViewProvider = ({ children }: PropsWithChildren) => {
	const { instanceId } = route.useParams();
	const [selectedFolderFile, setSelectedFolderFile] = useState<HandleFileSelectParams>({
		filePath: '',
		projectName: '',
		content: '',
	});

	const { data: getComponentFileQueryData, refetch: refetchComponentFile } = useQuery(
		getComponentFileQuery(
			{
				file: selectedFolderFile.filePath.split('/').slice(2).join('/'), // removes the first two segments (/components/<projectName>)
				project: selectedFolderFile.projectName,
			},
			instanceId
		)
	);

	const { mutate: saveComponentFile, isPending: isSavingFile } = useUpdateComponentFile();

	useEffect(() => {
		if (
			getComponentFileQueryData?.message &&
			getComponentFileQueryData.file == selectedFolderFile.filePath.split('/').slice(2).join('/')
		) {
			setSelectedFolderFile((prev) => ({
				...prev,
				content: getComponentFileQueryData?.message,
			}));
		}
	}, [getComponentFileQueryData, selectedFolderFile.filePath]);

	const handleFileSelect = useCallback(
		async (selectedFileInfo: HandleFileSelectParams) => {
			await setSelectedFolderFile({
				...selectedFileInfo,
			});
			if (!isFolder(selectedFileInfo.entries) && selectedFileInfo.entries == undefined) {
				await refetchComponentFile();
			}
		},
		[refetchComponentFile]
	);

	const updateEditorContent = useCallback((content: string) => {
		setSelectedFolderFile((prev) => ({
			...prev,
			content: content,
		}));
	}, []);

	const onSaveFile = useCallback(
		(data: SetComponentFileRequest) => {
			saveComponentFile(data, {
				onSuccess: () => {
					toast.success('Success', {
						description: `${data.file.split('/').pop()} saved successfully.`,
						action: {
							label: 'Dismiss',
							onClick: () => toast.dismiss(),
						},
					});
				},
				onError: (error) => {
					console.error('Error saving file:', error);
				},
			});
		},
		[saveComponentFile]
	);

	const value = useMemo<EditorViewContextValue>(() => {
		return {
			selectedFolderFile: selectedFolderFile,
			handleFileSelect,
			updateEditorContent,
			onSaveFile,
			isSavingFile,
			isFolder,
		};
	}, [selectedFolderFile, handleFileSelect, updateEditorContent, onSaveFile, isSavingFile]);
	return <EditorViewContext.Provider value={value}>{children}</EditorViewContext.Provider>;
};
