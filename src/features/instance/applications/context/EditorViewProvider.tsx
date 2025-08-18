import { EditorViewContext, EditorViewContextValue } from '@/features/instance/applications/context/EditorViewContext';
import {
	SetComponentFileRequest,
	useUpdateComponentFile,
} from '@/features/instance/operations/mutations/updateComponentFile';
import { getComponentFileQuery } from '@/features/instance/operations/queries/getComponentFile';
import { DirectoryEntry, HandleFileSelectParams } from '@/features/instance/operations/queries/getComponents';
import { useQuery } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { PropsWithChildren, useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

const route = getRouteApi('');
const isFolder = (entries?: DirectoryEntry[]) => Boolean(entries);
export const EditorViewProvider = ({ children }: PropsWithChildren) => {
	const { instanceId } = route.useParams();
	const [selectedFolderFile, setSelectedFolderFile] = useState<HandleFileSelectParams>({
		filePath: '',
		projectName: '',
		content: '',
	});

	const { data: getComponentFileQueryData } = useQuery(
		getComponentFileQuery(
			{
				file:
					selectedFolderFile.entries == undefined
						? // removes the first two segments
						  // (/components/<projectName>)
						  selectedFolderFile.filePath.split('/').slice(2).join('/')
						: // don't try to load the contents of folders
						  '',
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

	const handleFileSelect = useCallback(async (selectedFileInfo: HandleFileSelectParams) => {
		setSelectedFolderFile({
			...selectedFileInfo,
		});
	}, []);

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
						description: `${data.file.split('/').pop()} saved successfully. A restart is required to see changes.`,
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
