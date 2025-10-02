import { Button } from '@/components/ui/button';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { useEditorView } from '@/features/instance/applications/hooks/useEditorView';
import { AddFolderFileModal } from '@/features/instance/applications/modals/AddFolderFileModal';
import { DeleteFolderFileModal } from '@/features/instance/applications/modals/DeleteFolderFileModal';
import { useDeleteComponentFolderFile } from '@/features/instance/operations/mutations/deleteComponentFolderFile';
import { useDeployComponentMutation } from '@/features/instance/operations/mutations/deployComponent';
import { useUpdateComponentFile } from '@/features/instance/operations/mutations/updateComponentFile';
import { getComponentsQueryOptions } from '@/features/instance/operations/queries/getComponents';
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { Minus, Plus, RefreshCwIcon } from 'lucide-react';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { RedeployApplicationModal } from '../../../modals/RedeployApplication';

export function FileMenuActionButtons() {
	const queryClient = useQueryClient();
	const instanceParams = useInstanceClientIdParams();
	const { refetch: refetchComponents } = useSuspenseQuery(getComponentsQueryOptions(instanceParams));
	const [isAddFolderOrFileClicked, setIsAddFolderOrFileClicked] = useState(false);
	const [isAddingFolder, setIsAddingFolder] = useState(false);
	const [isDeleteFolderOrFileClicked, setIsDeleteFolderOrFileClicked] = useState(false);
	const [isRedeployApplicationClicked, setIsRedeployApplicationClicked] = useState(false);
	const { isFolder, selectedFolderFile, handleFileSelect } = useEditorView();
	const { mutate: addFolderFile, isPending: isAddFolderFilePending } = useUpdateComponentFile();
	const { mutate: deleteFolderFile, isPending: isDeleteFolderFilePending } = useDeleteComponentFolderFile();

	const handleAddFolderOrFile = useCallback(async (name: string) => {
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
	}, [addFolderFile, instanceParams, isAddingFolder, refetchComponents, selectedFolderFile]);

	const handleDeleteFolderOrFile = useCallback(async () => {
		deleteFolderFile(
			{
				file: selectedFolderFile.pkg
					? undefined
					: `${selectedFolderFile.filePath.split('/').slice(2).join('/')}`,
				project: selectedFolderFile.projectName,
				replicated: instanceParams.entityType === 'cluster',
				...instanceParams,
			},
			{
				onSuccess: () => {
					handleFileSelect({
						filePath: '',
						projectName: '',
						entries: [],
						content: '',
						pkg: '',
					});
					refetchComponents();
					setIsDeleteFolderOrFileClicked(false);
				},
			},
		);
	}, [deleteFolderFile, handleFileSelect, instanceParams, refetchComponents, selectedFolderFile]);

	const { mutate: reDeployApplication, isPending: isDeployComponentPending } = useDeployComponentMutation();

	const redeployPackage = useCallback((applicationUrl: string) => {
		const originalPackageUrl = selectedFolderFile.pkg;
		const toastId = toast.loading('Redeploying...');
		reDeployApplication({
			applicationName: selectedFolderFile.projectName,
			applicationUrl,
			replicated: instanceParams.entityType === 'cluster',
			...instanceParams,
		}, {
			onSuccess: () => {
				toast.success(
					`Application ${selectedFolderFile.projectName} redeployed successfully`,
					{
						id: toastId,
					},
				);
				void queryClient.invalidateQueries({
					queryKey: [instanceParams.entityId, 'get_components'],
					refetchType: 'active',
				});
				setIsRedeployApplicationClicked(false);
			},
			onError: () => {
				selectedFolderFile.pkg = originalPackageUrl
				toast.dismiss(toastId);
			}
		});
	}, [reDeployApplication, selectedFolderFile, instanceParams, queryClient]);

	const toggleDeleting = useCallback(() => {
		setIsDeleteFolderOrFileClicked(!isDeleteFolderOrFileClicked);
	}, [isDeleteFolderOrFileClicked]);

	return (
		<div className="p-2 border-b border-gray-700 mb-2 min-h-12">
			<div className='flex flex-wrap gap-2'>
				{selectedFolderFile.pkg && (
					<Button
						onClick={() => setIsRedeployApplicationClicked(true)}
						disabled={isDeployComponentPending}
						variant="positiveOutline"
						size="sm"
						className=" rounded-full"
					>
						<RefreshCwIcon className="w-4 h-4" />
						<span className="ms-1"> Redeploy Package</span>
					</Button>
				)}
				{!selectedFolderFile.pkg && selectedFolderFile.filePath && isFolder(selectedFolderFile.entries) ? (
					<>
						<Button
							onClick={() => {
								setIsAddFolderOrFileClicked(!isAddFolderOrFileClicked);
								setIsAddingFolder(true);
							}}
							disabled={false}
							variant="positiveOutline"
							size="sm"
							className=" rounded-full"
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
							className=" rounded-full"
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
						onClick={toggleDeleting}
						disabled={isDeployComponentPending}
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
				<span className="text-gray-500">Please select a folder or file</span> : null}

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
				isPackageSelected={!!selectedFolderFile.pkg}
				isPending={isDeleteFolderFilePending}
				handleDeleteFolderOrFile={handleDeleteFolderOrFile}
			/>
			<RedeployApplicationModal
				isModalOpen={isRedeployApplicationClicked}
				setIsModalOpen={setIsRedeployApplicationClicked}
				redeployPackage={redeployPackage}
				packageUrl={selectedFolderFile.pkg}
			/>
		</div>
	);
}
