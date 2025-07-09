import { useQuery } from '@tanstack/react-query';
import { createContext, PropsWithChildren, useState } from 'react';
import { getComponentFileQuery } from '../../operations/queries/getComponentFile';
import { set } from 'react-hook-form';

type HandleFileSelectParams = {
	filePath: string;
	projectName: string;
	content?: string; // Optional content for the file, if needed
};

type EditorViewContextValue = {
	selectedFile: HandleFileSelectParams;
	hasProjects?: boolean;
	canAddFile?: boolean;
	canDeleteFolder?: boolean;
	canAddProjectFolder?: boolean;
	handleFileSelect: (params: HandleFileSelectParams) => void;
	updateEditorContent?: (content: string) => string;
};

const EditorViewContext = createContext<EditorViewContextValue | null>(null);

const EditorViewProvider = ({ children }: PropsWithChildren) => {
	// const { instanceId } = route.useParams();

	// const { data: getComponentsQueryData } = useSuspenseQuery(getComponentsQueryOptions(instanceId));
	const [selectedFile, setSelectedFile] = useState<HandleFileSelectParams>({
		filePath: '',
		projectName: '',
		content: '',
	});
	const [selectedFolder, setSelectedFolder] = useState({ name: '', url: '', packageName: '' }); // selectedFolder = { name, key }
	// const [selectedPackage, setSelectedPackage] = useState({ name: '', url: '', packageName: '', content: '' }); // selectedPackage = { name, url }
	// const [savingFile, setSavingFile] = useState(false);

	const { data: getComponentFileQueryData, refetch: refetchComponentFile } = useQuery(
		getComponentFileQuery({
			file: selectedFile.filePath.split('/').splice(2).join('/'), // removes the first two segments (/components/<projectName>)
			project: selectedFile.projectName,
		})
	);

	// const hasProjects = getComponentsQueryData?.entries?.length > 0;
	// const canAddFile = Boolean(hasProjects && selectedFolder); // can only add a file if a target folder is selected
	// const canDeleteFolder = Boolean(hasProjects && (selectedFolder || selectedPackage)); // can only delete a folder if a target folder is selected
	const canAddProjectFolder = Boolean(selectedFolder); // can only add a folder to a project if a target folder is selected

	const handleFileSelect = async (selectedFileInfo: HandleFileSelectParams) => {
		await setSelectedFile({
			...selectedFileInfo,
		});
		refetchComponentFile();
		updateEditorContent(getComponentFileQueryData?.message || '');
	};

	const updateEditorContent = (content: string) => {
		// Logic to update the editor content
		setSelectedFile((prev) => ({
			...prev,
			content: content,
		}));
		// Here you would typically update the state or make an API call to save the content to display in the editor
	};
	return (
		<EditorViewContext.Provider
			value={{
				// hasProjects,
				// canAddFile,
				// canDeleteFolder,
				// getComponentFileQueryData,
				selectedFile,
				canAddProjectFolder,
				handleFileSelect,
				updateEditorContent,
			}}
		>
			{children}
		</EditorViewContext.Provider>
	);
};

export { EditorViewContext, EditorViewProvider };
export type { EditorViewContextValue };
