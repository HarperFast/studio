import { RestartButton } from '@/components/RestartButton';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { newApplication } from '@/features/instance/applications/components/ApplicationsSidebar/specialItems';
import { useEditorFileContent } from '@/features/instance/applications/context/editorFileContent';
import { isDirectory } from '@/features/instance/applications/context/isDirectory';
import { useEditorView } from '@/features/instance/applications/hooks/useEditorView';
import { useInstanceBrowseManagePermission } from '@/hooks/usePermissions';
import { useEmitToListeners } from '@/lib/events/listener';
import { useSetWatchedValue } from '@/lib/events/watcher';
import {
	DownloadIcon,
	FileIcon,
	FolderIcon,
	LockIcon,
	PackageIcon,
	PanelRightCloseIcon,
	PanelRightOpenIcon,
	PencilIcon,
	PlusIcon,
	SaveIcon,
	TrashIcon,
	Undo2Icon,
} from 'lucide-react';

import './ContentActions.css';

export function ContentActions({
	toggledSidebar,
	toggleSidebar,
}: {
	toggledSidebar: boolean;
	toggleSidebar: () => void;
}) {
	const instanceParams = useInstanceClientIdParams();
	const { openedEntryContents, openedEntry, isSavingFile, restrictPackageModification } = useEditorView();
	const { content: updatedFileContent } = useEditorFileContent(openedEntry?.path);
	const canManageBrowseInstance = useInstanceBrowseManagePermission();
	const targetNoun = instanceParams.entityType === 'instance' ? 'Instance' : 'Cluster';

	const onAddFileClick = useSetWatchedValue('ShowAddDirectoryOrFileModalType', 'file');
	const onAddDirectoryClick = useSetWatchedValue('ShowAddDirectoryOrFileModalType', 'directory');
	const onDownloadApplicationClick = useSetWatchedValue('ShowDownloadApplicationModal', true);
	const onRenameClick = useSetWatchedValue('ShowRenameFileModal', true);
	const onDeleteClick = useSetWatchedValue('ShowDeleteDirectoryOrFileModal', true);
	const onRedeployClick = useSetWatchedValue('ShowRedeployApplicationModal', true);
	const onSaveClick = useEmitToListeners('SaveFile', true);
	const onRevertChangesClicked = useEmitToListeners('RevertChanges', true);
	const onNewTableClick = useEmitToListeners('ShowNewTableModal', true);

	const fileIsClean = updatedFileContent === undefined || updatedFileContent === openedEntryContents;

	return (
		<div className="absolute top-0 right-0 left-0 backdrop-blur-sm bg-black-10 shadow-xl flex pr-4 md:pr-12">
			<Button
				variant="ghost"
				className={(toggledSidebar ? 'toggled-sidebar-toggler' : 'hidden-sidebar-toggler')
					+ ' inline-flex'
					+ ' text-sm md:hidden'
					+ ' focus:outline-none'
					+ ' focus:ring-2'
					+ ' text-white'
					+ ' hover:text-grey focus:ring-gray-600 rounded-none'}
				onClick={toggleSidebar}
			>
				<span className="sr-only">{toggledSidebar ? 'Close' : 'Open'} sidebar</span>
				{toggledSidebar ? <PanelRightOpenIcon /> : <PanelRightCloseIcon />}
			</Button>

			{openedEntry && openedEntry?.path !== newApplication && (
				<>
					{openedEntry.package && (
						<Tooltip>
							<TooltipTrigger asChild>
								<Button variant="ghost" type="button" className="cursor-help">
									<LockIcon width={16} height={16} />
									<span className="hidden md:inline-block">Imported applications are read-only</span>
								</Button>
							</TooltipTrigger>
							<TooltipContent>
								{restrictPackageModification
									? (
										<>
											This application is read-only, and cannot be modified.
											<br />
											It helps govern clustering amongst your instances.
										</>
									)
									: (
										<>
											This application is read-only, and cannot be directly modified. But you can re-deploy or remove
											it.
										</>
									)}
							</TooltipContent>
						</Tooltip>
					)}

					{!isDirectory(openedEntry) && !openedEntry.package && canManageBrowseInstance && (
						<Button
							variant="default"
							className="rounded-none"
							onClick={onSaveClick}
							disabled={fileIsClean || isSavingFile}
							title="Save"
						>
							<SaveIcon className="pointer-events-none" />
							<span className="hidden lg:inline-block pointer-events-none">
								<u>S</u>ave
							</span>
						</Button>
					)}

					{!isDirectory(openedEntry) && !openedEntry.package && canManageBrowseInstance && (
						<Button
							variant="ghost"
							className="rounded-none"
							onClick={onRenameClick}
							disabled={!fileIsClean || isSavingFile}
							title="Rename"
						>
							<PencilIcon className="pointer-events-none" />
							<span className="hidden lg:inline-block pointer-events-none">
								<u>R</u>ename
							</span>
						</Button>
					)}

					{!openedEntry.package && canManageBrowseInstance && (
						<Button variant="ghost" className="rounded-none" onClick={onAddFileClick} title="New File">
							<FileIcon className="pointer-events-none" />
							<span className="pointer-events-none hidden lg:inline-block">
								<u>N</u>ew
								<span className="hidden lg:inline-block">&nbsp;File</span>
							</span>
						</Button>
					)}

					{!openedEntry.package && canManageBrowseInstance && (
						<Button variant="ghost" className="rounded-none" onClick={onAddDirectoryClick} title="Add Directory">
							<FolderIcon className="pointer-events-none" />
							<span className="pointer-events-none hidden lg:inline-block">
								<u>A</u>dd
								<span className="hidden xl:inline-block">&nbsp;Directory</span>
							</span>
						</Button>
					)}

					{openedEntry.path.endsWith('.graphql') && canManageBrowseInstance && (
						<Button variant="ghost" className="rounded-none" onClick={onNewTableClick} title="New Table">
							<PlusIcon className="pointer-events-none" />
							<span className="hidden lg:inline-block pointer-events-none">
								<span className="hidden xl:inline-block">New</span> Table
							</span>
						</Button>
					)}

					{openedEntry.project && (
						<Button
							variant="ghost"
							className="rounded-none"
							onClick={onDownloadApplicationClick}
							title="Download Application"
						>
							<DownloadIcon className="pointer-events-none" />
							<span className="hidden lg:inline-block pointer-events-none">
								Download
								<span className="hidden 2xl:inline-block">&nbsp;Application</span>
							</span>
						</Button>
					)}

					{!!openedEntry.package && canManageBrowseInstance && !restrictPackageModification && (
						<Button variant="ghost" className="rounded-none" onClick={onRedeployClick} title="Redeploy Package">
							<PackageIcon className="pointer-events-none" />
							<span className="pointer-events-none">
								Redeploy <u>P</u>ackage
							</span>
						</Button>
					)}

					<div className="grow"></div>

					{canManageBrowseInstance && (
						<RestartButton
							targetNoun={targetNoun}
							instanceClient={instanceParams.instanceClient}
							operation="restart_service"
							variant="ghost"
							className="rounded-none mx-0 md:mx-0"
							disabled={!fileIsClean || isSavingFile}
						/>
					)}

					{!isDirectory(openedEntry) && !openedEntry.package && canManageBrowseInstance && (
						<Button
							variant="ghost"
							className="rounded-none"
							onClick={onRevertChangesClicked}
							disabled={fileIsClean || isSavingFile}
							title="Revert Changes"
						>
							<Undo2Icon className="pointer-events-none" />
							<span className="hidden xl:inline-block pointer-events-none">
								Revert <span className="hidden 2xl:inline-block">Changes</span>
							</span>
						</Button>
					)}

					{!restrictPackageModification && canManageBrowseInstance && (
						<Button variant="destructiveGhost" className="rounded-none" onClick={onDeleteClick} title="Delete">
							<TrashIcon className="pointer-events-none" />
							<span className="hidden xl:inline-block pointer-events-none">
								<u>D</u>elete
							</span>
						</Button>
					)}
				</>
			)}
		</div>
	);
}
