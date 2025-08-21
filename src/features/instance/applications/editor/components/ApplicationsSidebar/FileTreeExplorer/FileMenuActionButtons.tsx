import { Button } from '@/components/ui/button';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { useEditorView } from '@/features/instance/applications/hooks/useEditorView';
import { AddFolderFileModal } from '@/features/instance/applications/modals/AddFolderFileModal';
import { DeleteFolderFileModal } from '@/features/instance/applications/modals/DeleteFolderFileModal';
import { useDeleteComponentFolderFile } from '@/features/instance/operations/mutations/deleteComponentFolderFile';
import { useUpdateComponentFile } from '@/features/instance/operations/mutations/updateComponentFile';
import { getComponentsQueryOptions } from '@/features/instance/operations/queries/getComponents';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Minus, Plus } from 'lucide-react';
import { useState } from 'react';

export function FileMenuActionButtons() {
	const instanceParams = useInstanceClientIdParams();
	const { refetch: refetchComponents } = useSuspenseQuery(getComponentsQueryOptions(instanceParams));
	const [isAddFolderOrFileClicked, setIsAddFolderOrFileClicked] = useState(false);
	const [isAddingFolder, setIsAddingFolder] = useState(false);
	const [isDeleteFolderOrFileClicked, setIsDeleteFolderOrFileClicked] = useState(false);
	const { isFolder, selectedFolderFile, handleFileSelect } = useEditorView();
	const { mutate: addFolderFile, isPending: isAddFolderFilePending } = useUpdateComponentFile();
	const { mutate: deleteFolderFile, isPending: isDeleteFolderFilePending } = useDeleteComponentFolderFile();

	const handleAddFolderOrFile = async (name: string) => {
		addFolderFile(
			{
				file: `${selectedFolderFile.filePath.split('/').slice(2).join('/')}/${name}`,
				project: selectedFolderFile.projectName,
				payload: isAddingFolder ? undefined : '',
				...instanceParams,
			},
			{
				onSuccess: () => {
					refetchComponents();
					setIsAddFolderOrFileClicked(false);
				},
			},
		);
	};

	const handleDeleteFolderOrFile = async () => {
		deleteFolderFile(
			{
				file: `${selectedFolderFile.filePath.split('/').slice(2).join('/')}`,
				project: selectedFolderFile.projectName,
				...instanceParams,
			},
			{
				onSuccess: () => {
					handleFileSelect({
						filePath: '',
						projectName: '',
						entries: [],
						content: '',
					});
					refetchComponents();
					setIsDeleteFolderOrFileClicked(false);
				},
			},
		);
	};

	return (
		<div className="p-2 border-b border-gray-700">
			<div>
				{selectedFolderFile.filePath && isFolder(selectedFolderFile.entries) ? (
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
				{selectedFolderFile.filePath ? (
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
				) : null}
			</div>

			{!selectedFolderFile.filePath ?
				<span className="text-gray-500">Please Select a folder or file</span> : null}

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
