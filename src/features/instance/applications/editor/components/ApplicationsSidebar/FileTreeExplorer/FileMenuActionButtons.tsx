import { Button } from '@/components/ui/button';
import { useEditorView } from '@/features/instance/applications/hooks/useEditorView';
import { AddFolderFileModal } from '@/features/instance/applications/modals/AddFolderFileModal';
import { useUpdateComponentFile } from '@/features/instance/operations/mutations/updateComponentFile';
import { Minus, Plus } from 'lucide-react';
import { useState } from 'react';

export function FileMenuActionButtons() {
	const [isAddFolderOrFileClicked, setIsAddFolderOrFileClicked] = useState(false);
	const [isAddingFolder, setIsAddingFolder] = useState(false);
	const { selectedFolderFile } = useEditorView(); // Assuming useEditorView is imported from the correct context
	const { mutate: addFolderFile, isPending: isAddFolderFilePending } = useUpdateComponentFile();

	const handleAddFolderOrFile = (name: string) => {
		addFolderFile({
			file: `${selectedFolderFile.filePath.split('/').slice(2).join('/')}/${name}`,
			project: selectedFolderFile.projectName,
			payload: isAddingFolder ? undefined : '', // Adjust as needed
		});
	};

	return (
		<div className="p-2">
			<div>
				<Button
					onClick={() => {
						setIsAddFolderOrFileClicked(!isAddFolderOrFileClicked);
						setIsAddingFolder(true);
					}}
					disabled={false}
					variant="positiveOutline"
					size="sm"
					className="mr-2"
				>
					<Plus className="w-4 h-4" />
					<span className="ms-1"> Folder</span>
				</Button>
				<Button
					onClick={() => {
						setIsAddFolderOrFileClicked(!isAddFolderOrFileClicked);
						setIsAddingFolder(false);
					}}
					disabled={false}
					variant="positiveOutline"
					size="sm"
					className="mr-2"
				>
					<Plus className="w-4 h-4" />
					<span className="ms-1"> File</span>
				</Button>
				<Button
					onClick={() => setIsAddFolderOrFileClicked(!isAddFolderOrFileClicked)}
					disabled={false}
					variant="destructiveOutline"
					size="sm"
				>
					<Minus className="w-4 h-4" />
					<span className="ms-1"> Delete</span>
				</Button>
			</div>

			<AddFolderFileModal
				isModalOpen={isAddFolderOrFileClicked}
				setIsModalOpen={setIsAddFolderOrFileClicked}
				isAddingFolder={isAddingFolder}
				handleAddFolderOrFile={handleAddFolderOrFile}
				isPending={isAddFolderFilePending}
			/>
		</div>
	);
}
