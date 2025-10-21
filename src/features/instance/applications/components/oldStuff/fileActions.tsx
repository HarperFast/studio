// import { RestartButton } from '@/components/RestartButton';
// import { Button } from '@/components/ui/button';
// import { isLocalStudio } from '@/config/constants';
// import { useInstanceClientParams } from '@/config/useInstanceClient';
// import { useEditorView } from '@/features/instance/applications/hooks/useEditorView';
// import { NewApplicationModal } from '@/features/instance/applications/modals/NewApplicationModal';
// import { useEffectedState } from '@/hooks/useEffectedState';
// import { useInstanceBrowseManagePermission } from '@/hooks/usePermissions';
// import { useToggler } from '@/hooks/useToggler';
// import { useParams } from '@tanstack/react-router';
// import { PlusIcon, Save } from 'lucide-react';
// import { useCallback, useState } from 'react';
//
// export function FileActions() {
// 	const { openedEntryContents, openedEntry, saveFile, isSavingFile } = useEditorView();
// 	const [updateFileContent, setUpdateFileContent] = useEffectedState<string | undefined>(
// 		openedEntryContents || undefined,
// 		[openedEntryContents],
// 	);
// 	const { instanceId }: { instanceId: string } = useParams({ strict: false });
// 	const {
// 		toggled: isNewApplicationModalOpen,
// 		setToggled: setIsNewApplicationModalOpen,
// 		toggleOn: openApplicationModal,
// 	} = useToggler(false);
// 	const [appType, setAppType] = useState<'create' | 'import'>('create');
//
// 	const targetNoun = instanceId || isLocalStudio ? 'Instance' : 'Cluster';
// 	const instanceParams = useInstanceClientParams();
// 	const crumbPath = openedEntry?.path.split('/').join('/').replace(/\//g, ' > ');
//
// 	const canManageBrowseInstance = useInstanceBrowseManagePermission();
//
// 	return (
// 		<div className="hidden items-center justify-between py-1 border-b border-gray-700">
// 			<span className="p-2">{openedEntry.path ? crumbPath : 'Select a file'}</span>
// 			{!openedEntry.package && canManageBrowseInstance && (
// 				<div className="flex flex-col justify-end space-y-2 md:justify-normal md:flex-row">
// 					<Button
// 						variant="positiveOutline"
// 						className="w-38 rounded-full"
// 						onClick={onSaveClick}
// 						disabled={
// 							!openedEntry.path ||
// 							updateFileContent === undefined ||
// 							updateFileContent === openedEntryContents ||
// 							isSavingFile
// 						}
// 					>
// 						<Save />
// 						<span className="ms-1">Save</span>
// 					</Button>
// 					<RestartButton
// 						targetNoun={targetNoun}
// 						instanceClient={instanceParams.instanceClient}
// 						operation="restart_service"
// 					/>
//
// 					<Button variant="defaultOutline" className="w-38 rounded-full" onClick={openApplicationModal}>
// 						<PlusIcon /> New Application
// 					</Button>
// 				</div>
// 			)}
//
// 			<NewApplicationModal
// 				isModalOpen={isNewApplicationModalOpen}
// 				setIsModalOpen={setIsNewApplicationModalOpen}
// 				appType={appType}
// 				setAppType={setAppType}
// 			/>
// 		</div>
// 	);
// }
