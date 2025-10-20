import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { EditorViewContext, EditorViewContextValue } from '@/features/instance/applications/context/EditorViewContext';
import {
	SetComponentFileRequest,
	useUpdateComponentFile,
} from '@/features/instance/operations/mutations/updateComponentFile';
import { getComponentFileQueryOptions } from '@/features/instance/operations/queries/getComponentFile';
import { DirectoryEntry, HandleFileSelectParams } from '@/features/instance/operations/queries/getComponents';
import { useQuery } from '@tanstack/react-query';
import { PropsWithChildren, useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

function isFolder(entries?: DirectoryEntry[]) {
	return Boolean(entries);
}

export function EditorViewProvider({ children }: PropsWithChildren) {
	const [selectedFolderFile, setSelectedFolderFile] = useState<HandleFileSelectParams>({
		filePath: '',
		projectName: '',
		content: '',
	});
	const instanceParams = useInstanceClientIdParams();

	/*
	 Load the selected file contents.
	 */
	const { data: getComponentFileQueryData } = useQuery(
		getComponentFileQueryOptions(
			{
				file:
					!selectedFolderFile.entries
						? // removes the first two segments
							// (/components/<projectName>)
						selectedFolderFile.filePath.split('/').slice(2).join('/')
						: // don't try to load the contents of folders
						'',
				project: selectedFolderFile.projectName,
				...instanceParams,
			},
		),
	);
	useEffect(() => {
		if (
			getComponentFileQueryData?.message &&
			getComponentFileQueryData.file == selectedFolderFile.filePath.split('/').slice(2).join('/')
		) {
			setSelectedFolderFile((prev) => ({
				...prev,
				content: getComponentFileQueryData.message,
			}));
		}
	}, [getComponentFileQueryData, selectedFolderFile.filePath]);

	/*
	 Load the selected directory read-me contents.
	 */
	const { data: getReadMeQueryData } = useQuery(
		getComponentFileQueryOptions(
			{
				file:
					selectedFolderFile.directoryReadMe?.path
						? // removes the first two segments
							// (/components/<projectName>)
						selectedFolderFile.directoryReadMe.path.split('/').slice(2).join('/')
						:
						'',
				project: selectedFolderFile.projectName,
				...instanceParams,
			},
		),
	);
	useEffect(() => {
		if (
			getReadMeQueryData?.message &&
			getReadMeQueryData.file == selectedFolderFile.directoryReadMe?.path?.split('/').slice(2).join('/')
		) {
			setSelectedFolderFile((prev) => ({
				...prev,
				directoryReadMe: {
					name: '',
					...prev.directoryReadMe,
					content: getReadMeQueryData.message,
				}
			}));
		}
	}, [getReadMeQueryData, selectedFolderFile.directoryReadMe?.path]);

	/*
	 Save changes.
	 */
	const { mutate: saveComponentFile, isPending: isSavingFile } = useUpdateComponentFile();
	const onSaveFile = useCallback(
		(data: SetComponentFileRequest, filePath: string) => {
			saveComponentFile(data, {
				onSuccess: () => {
					if (selectedFolderFile?.filePath === filePath) {
						setSelectedFolderFile({
							...selectedFolderFile,
							content: data.payload,
						});
					}
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
		[saveComponentFile, selectedFolderFile],
	);

	/*
	 Memoize the tracked state.
	 */
	const value = useMemo<EditorViewContextValue>(() => {
		return {
			selectedFolderFile: selectedFolderFile,
			handleFileSelect: setSelectedFolderFile,
			onSaveFile,
			isSavingFile,
			isFolder,
		};
	}, [selectedFolderFile, setSelectedFolderFile, onSaveFile, isSavingFile]);
	return <EditorViewContext.Provider value={value}>{children}</EditorViewContext.Provider>;
}
