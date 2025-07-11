import { useQuery } from '@tanstack/react-query';
import { createContext, PropsWithChildren, useEffect, useState } from 'react';
import { getComponentFileQuery } from '../../operations/queries/getComponentFile';
import { DirectoryEntry } from '../../operations/queries/getComponents';
import { SetComponentFileRequest, useUpdateComponentFile } from '../../operations/mutations/updateComponentFile';
import { toast } from 'sonner';

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
	// canAddProjectFolder?: boolean;
	isFolder: (entry: DirectoryEntry[] | undefined) => boolean;
	handleFileSelect: (params: HandleFileSelectParams) => void;
	updateEditorContent?: (content: string) => void;
	onSaveFile: (data: SetComponentFileRequest) => void; // Optional save function
	isSavingFile: boolean; // Optional saving state
};

export const EditorViewContext = createContext<EditorViewContextValue | null>(null);

export const EditorViewProvider = ({ children }: PropsWithChildren) => {
	// const { instanceId } = route.useParams();

	// const { data: getComponentsQueryData } = useSuspenseQuery(getComponentsQueryOptions(instanceId));
	const [selectedFolderFile, setSelectedFile] = useState<HandleFileSelectParams>({
		filePath: '',
		projectName: '',
		content: '',
	});
	// const [selectedFolder, setSelectedFolder] = useState({ name: '', url: '', packageName: '' }); // selectedFolder = { name, key }
	// const [selectedPackage, setSelectedPackage] = useState({ name: '', url: '', packageName: '', content: '' }); // selectedPackage = { name, url }
	// const [savingFile, setSavingFile] = useState(false);

	const { data: getComponentFileQueryData, refetch: refetchComponentFile } = useQuery(
		getComponentFileQuery({
			file: selectedFolderFile.filePath.split('/').slice(2).join('/'), // removes the first two segments (/components/<projectName>)
			project: selectedFolderFile.projectName,
		})
	);

	const { mutate: saveComponentFile, isPending: isSavingFile } = useUpdateComponentFile();

	useEffect(() => {
		if (
			getComponentFileQueryData?.message &&
			getComponentFileQueryData.file == selectedFolderFile.filePath.split('/').slice(2).join('/')
		) {
			setSelectedFile((prev) => ({
				...prev,
				content: getComponentFileQueryData?.message,
			}));
		}
	}, [getComponentFileQueryData]);

	const isFolder = (entries?: DirectoryEntry[]) => Boolean(entries && entries.length > 0);
	// const hasProjects = getComponentsQueryData?.entries?.length > 0;
	// const canAddFile = Boolean(hasProjects && selectedFolder); // can only add a file if a target folder is selected
	// const canDeleteFolder = Boolean(hasProjects && (selectedFolder || selectedPackage)); // can only delete a folder if a target folder is selected
	// const canAddProjectFolder = Boolean(selectedFolder); // can only add a folder to a project if a target folder is selected

	const handleFileSelect = async (selectedFileInfo: HandleFileSelectParams) => {
		await setSelectedFile({
			...selectedFileInfo,
		});
		if (!isFolder(selectedFileInfo.entries) && selectedFileInfo.entries != undefined) {
			await refetchComponentFile();
		}
	};

	const updateEditorContent = (content: string) => {
		// Logic to update the editor content
		setSelectedFile((prev) => ({
			...prev,
			content: content,
		}));
		// Here you would typically update the state or make an API call to save the content to display in the editor
	};

	const onSaveFile = (data: SetComponentFileRequest) => {
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
	};
	return (
		<EditorViewContext.Provider
			value={{
				// hasProjects,
				// canAddFile,
				// canDeleteFolder,
				// getComponentFileQueryData,
				selectedFolderFile: selectedFolderFile,
				// canAddProjectFolder,
				handleFileSelect,
				updateEditorContent,
				onSaveFile,
				isSavingFile,
				isFolder,
			}}
		>
			{children}
		</EditorViewContext.Provider>
	);
};
