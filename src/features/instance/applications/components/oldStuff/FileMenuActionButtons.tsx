// import { Button } from '@/components/ui/button';
// import { useInstanceClientIdParams } from '@/config/useInstanceClient';
// import { isDirectory } from '@/features/instance/applications/context/isDirectory';
// import { useEditorView } from '@/features/instance/applications/hooks/useEditorView';
// import { AddFolderFileModal } from '@/features/instance/applications/modals/AddFolderFileModal';
// import { DeleteFolderFileModal } from '@/features/instance/applications/modals/DeleteFolderFileModal';
// import { useDeleteComponentFolderFile } from '@/features/instance/operations/mutations/deleteComponentFolderFile';
// import { useDeployComponentMutation } from '@/features/instance/operations/mutations/deployComponent';
// import { useUpdateComponentFile } from '@/features/instance/operations/mutations/updateComponentFile';
// import { getComponentsQueryOptions } from '@/features/instance/operations/queries/getComponents';
// import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
// import { Minus, Plus, RefreshCwIcon } from 'lucide-react';
// import { useCallback, useMemo, useState } from 'react';
// import { toast } from 'sonner';
// import { RedeployApplicationModal } from '@/features/instance/applications/modals/RedeployApplicationModal';
//
// export function FileMenuActionButtons() {
// 	const queryClient = useQueryClient();
// 	const instanceParams = useInstanceClientIdParams();
// 	const [isAddFolderOrFileClicked, setIsAddFolderOrFileClicked] = useState(false);
// 	const [isAddingFolder, setIsAddingFolder] = useState(false);
// 	const [isDeleteFolderOrFileClicked, setIsDeleteFolderOrFileClicked] = useState(false);
// 	const [isRedeployApplicationClicked, setIsRedeployApplicationClicked] = useState(false);
// 	const { openedEntry, setOpenedEntry } = useEditorView();
// 	const { mutate: addFolderFile, isPending: isAddFolderFilePending } = useUpdateComponentFile();
// 	const { mutate: deleteFolderFile, isPending: isDeleteFolderFilePending } = useDeleteComponentFolderFile();
//
// 	const handleAddFolderOrFile = useCallback(async (name: string) => {
// 		addFolderFile(
// 			{
// 				file: `${openedEntry.filePath.split('/').slice(1).join('/')}/${name}`,
// 				project: openedEntry.projectName,
// 				payload: isAddingFolder ? undefined : '',
// 				...instanceParams,
// 			},
// 			{
// 				onSuccess: () => {
// 					refetchComponents();
// 					setIsAddFolderOrFileClicked(false);
// 				},
// 			},
// 		);
// 	}, [addFolderFile, instanceParams, isAddingFolder, refetchComponents, openedEntry]);
//
// 	const handleDeleteFolderOrFile = useCallback(async () => {
// 		deleteFolderFile(
// 			{
// 				file: openedEntry.pkg
// 					? undefined
// 					: `${openedEntry.filePath.split('/').slice(1).join('/')}`,
// 				project: openedEntry.projectName,
// 				replicated: instanceParams.entityType === 'cluster',
// 				...instanceParams,
// 			},
// 			{
// 				onSuccess: () => {
// 					setOpenedEntry({
// 						filePath: '',
// 						projectName: '',
// 						entries: [],
// 						content: '',
// 						pkg: '',
// 					});
// 					refetchComponents();
// 					setIsDeleteFolderOrFileClicked(false);
// 				},
// 			},
// 		);
// 	}, [deleteFolderFile, setOpenedEntry, instanceParams, refetchComponents, openedEntry]);
//
// 	const { mutate: reDeployApplication, isPending: isDeployComponentPending } = useDeployComponentMutation();
//
// 	const redeployPackage = useCallback((applicationUrl: string) => {
// 		const originalPackageUrl = openedEntry.pkg;
// 		const toastId = toast.loading('Redeploying...');
// 		reDeployApplication({
// 			applicationName: openedEntry.projectName,
// 			applicationUrl,
// 			replicated: instanceParams.entityType === 'cluster',
// 			...instanceParams,
// 		}, {
// 			onSuccess: () => {
// 				toast.success(
// 					`Application ${openedEntry.projectName} redeployed successfully`,
// 					{
// 						id: toastId,
// 					},
// 				);
// 				void queryClient.invalidateQueries({
// 					queryKey: [instanceParams.entityId, 'get_components'],
// 					refetchType: 'active',
// 				});
// 				setIsRedeployApplicationClicked(false);
// 			},
// 			onError: () => {
// 				openedEntry.pkg = originalPackageUrl
// 				toast.dismiss(toastId);
// 			}
// 		});
// 	}, [reDeployApplication, openedEntry, instanceParams, queryClient]);
// 	const restrictPackageModification = useMemo(() => {
// 		return openedEntry.pkg?.includes('github.com/HarperDB/status-check-fabric')
// 			|| openedEntry.pkg?.includes('github.com/HarperFast/status-check-fabric');
// 	}, [openedEntry.pkg]);
//
//
// 	const toggleDeleting = useCallback(() => {
// 		setIsDeleteFolderOrFileClicked(!isDeleteFolderOrFileClicked);
// 	}, [isDeleteFolderOrFileClicked]);
//
// 	return (
// 		<div className="p-2 border-b border-gray-700 mb-2 min-h-12">
// 			<div className='flex flex-wrap gap-2'>
// 				{openedEntry?.pkg && !restrictPackageModification && (
// 					<Button
// 						onClick={() => setIsRedeployApplicationClicked(true)}
// 						disabled={isDeployComponentPending}
// 						variant="positiveOutline"
// 						size="sm"
// 						className=" rounded-full"
// 					>
// 						<RefreshCwIcon className="w-4 h-4" />
// 						<span className="ms-1"> Redeploy Package</span>
// 					</Button>
// 				)}
// 				{!openedEntry?.pkg && openedEntry?.path && isDirectory(openedEntry) ? (
// 					<>
// 						<Button
// 							onClick={() => {
// 								setIsAddFolderOrFileClicked(!isAddFolderOrFileClicked);
// 								setIsAddingFolder(true);
// 							}}
// 							disabled={false}
// 							variant="positiveOutline"
// 							size="sm"
// 							className=" rounded-full"
// 						>
// 							<Plus className="w-4 h-4" />
// 							<span className="ms-1"> Folder</span>
// 						</Button>
//
// 						<Button
// 							onClick={() => {
// 								setIsAddFolderOrFileClicked(!isAddFolderOrFileClicked);
// 								setIsAddingFolder(false);
// 							}}
// 							disabled={false}
// 							variant="positiveOutline"
// 							size="sm"
// 							className=" rounded-full"
// 						>
// 							<Plus className="w-4 h-4" />
// 							<span className="ms-1"> File</span>
// 						</Button>
// 					</>
// 				) : (
// 					''
// 				)}
// 				{openedEntry.filePath && !restrictPackageModification ? (
// 					<Button
// 						onClick={toggleDeleting}
// 						disabled={isDeployComponentPending}
// 						variant="destructiveOutline"
// 						size="sm"
// 						className="rounded-full"
// 					>
// 						<Minus className="w-4 h-4" />
// 						<span className="ms-1"> Delete</span>
// 					</Button>
// 				) : null}
// 			</div>
//
// 			{!openedEntry.filePath ?
// 				<span className="text-gray-500">Please select a folder or file</span> : null}
//
// 			<AddFolderFileModal
// 				isModalOpen={isAddFolderOrFileClicked}
// 				setIsModalOpen={setIsAddFolderOrFileClicked}
// 				isAddingFolder={isAddingFolder}
// 				handleAddFolderOrFile={handleAddFolderOrFile}
// 				isPending={isAddFolderFilePending}
// 			/>
// 			<DeleteFolderFileModal
// 				isModalOpen={isDeleteFolderOrFileClicked}
// 				setIsModalOpen={setIsDeleteFolderOrFileClicked}
// 				isFolderSelected={isDirectory(openedEntry.entries)}
// 				isPackageSelected={!!openedEntry.pkg}
// 				isPending={isDeleteFolderFilePending}
// 				handleDeleteFolderOrFile={handleDeleteFolderOrFile}
// 			/>
// 			<RedeployApplicationModal
// 				isModalOpen={isRedeployApplicationClicked}
// 				setIsModalOpen={setIsRedeployApplicationClicked}
// 				redeployPackage={redeployPackage}
// 				isRedeployPackagePending={isDeployComponentPending}
// 				packageUrl={openedEntry.pkg}
// 			/>
// 		</div>
// 	);
// }
