import { Button } from '@/components/ui/button';
import { useEditorView } from '@/features/instance/applications/hooks/useEditorView';
import { AddFolderFileModal } from '@/features/instance/applications/modals/AddFolderFileModal';
import { DeleteFolderFileModal } from '@/features/instance/applications/modals/DeleteFolderFileModal';
import { useDeleteComponentFolderFile } from '@/features/instance/operations/mutations/deleteComponentFolderFile';
import { useUpdateComponentFile } from '@/features/instance/operations/mutations/updateComponentFile';
import { getComponentsQueryOptions } from '@/features/instance/operations/queries/getComponents';
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { Minus, Plus } from 'lucide-react';
import { useState } from 'react';

const route = getRouteApi('');

export function FileMenuActionButtons() {
	const queryClient = useQueryClient();
	const { instanceId } = route.useParams();
	const { refetch: refetchComponents } = useSuspenseQuery(getComponentsQueryOptions(instanceId));
	const [isAddFolderOrFileClicked, setIsAddFolderOrFileClicked] = useState(false);
	const [isAddingFolder, setIsAddingFolder] = useState(false);
	const [isDeleteFolderOrFileClicked, setIsDeleteFolderOrFileClicked] = useState(false);
	const { isFolder, selectedFolderFile, handleFileSelect } = useEditorView();
	const { mutate: addFolderFile, isPending: isAddFolderFilePending } = useUpdateComponentFile();
	const { mutate: deleteFolderFile, isPending: isDeleteFolderFilePending } = useDeleteComponentFolderFile();

	const handleAddFolderOrFile = async (name: string) => {
		await addFolderFile({
			file: `${selectedFolderFile.filePath.split('/').slice(2).join('/')}/${name}`,
			project: selectedFolderFile.projectName,
			payload: isAddingFolder ? undefined : '',
		});
		refetchComponents();
		setIsAddFolderOrFileClicked(false);
	};

	const handleDeleteFolderOrFile = async () => {
		await deleteFolderFile({
			file: `${selectedFolderFile.filePath.split('/').slice(2).join('/')}`,
			project: selectedFolderFile.projectName,
		});
		// Clear the selected file after deletion
		handleFileSelect({
			filePath: '',
			projectName: '',
			entries: [],
			content: '',
		});
		refetchComponents();
		setIsDeleteFolderOrFileClicked(false);
	};

	return (
		<div className="p-2 border-b border-gray-700">
			<div>
				{isFolder(selectedFolderFile.entries) ? (
					<>
						<Button
							onClick={() => {
								setIsAddFolderOrFileClicked(!isAddFolderOrFileClicked);
								setIsAddingFolder(true);
							}}
							disabled={false}
							variant="positiveOutline"
							size="sm"
							className="mr-2 rounded-full"
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
							className="mr-2 rounded-full"
						>
							<Plus className="w-4 h-4" />
							<span className="ms-1"> File</span>
						</Button>
					</>
				) : (
					''
				)}
				<Button
					onClick={() => setIsDeleteFolderOrFileClicked(!isDeleteFolderOrFileClicked)}
					disabled={false}
					variant="destructiveOutline"
					size="sm"
					className="rounded-full"
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
			<DeleteFolderFileModal
				isModalOpen={isDeleteFolderOrFileClicked}
				setIsModalOpen={setIsDeleteFolderOrFileClicked}
				isFolderSelected={isFolder(selectedFolderFile.entries)}
				isPending={isDeleteFolderFilePending}
				handleDeleteFolderOrFile={handleDeleteFolderOrFile}
			/>
		</div>
	);
}
