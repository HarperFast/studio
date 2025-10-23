import { RestartButton } from '@/components/RestartButton';
import { Button } from '@/components/ui/button';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { useEditorFileContent } from '@/features/instance/applications/context/editorFileContent';
import { isDirectory } from '@/features/instance/applications/context/isDirectory';
import { useEditorView } from '@/features/instance/applications/hooks/useEditorView';
import { useInstanceBrowseManagePermission } from '@/hooks/usePermissions';
import { useEmitToListeners } from '@/lib/events/listener';
import { useSetWatchedValue } from '@/lib/events/watcher';
import { FileIcon, FolderIcon, PackageIcon, PencilIcon, SaveIcon, TrashIcon, Undo2Icon } from 'lucide-react';

export function ContentActions() {
	const instanceParams = useInstanceClientIdParams();
	const { openedEntryContents, openedEntry, isSavingFile, restrictPackageModification } = useEditorView();
	const { content: updatedFileContent } = useEditorFileContent(openedEntry?.path);
	const canManageBrowseInstance = useInstanceBrowseManagePermission();
	const targetNoun = instanceParams.entityType === 'instance' ? 'Instance' : 'Cluster';

	const onAddFileClick = useSetWatchedValue('ShowAddDirectoryOrFileModalType', 'file');
	const onAddDirectoryClick = useSetWatchedValue('ShowAddDirectoryOrFileModalType', 'directory');
	const onRenameClick = useSetWatchedValue('ShowRenameFileModal', true);
	const onDeleteClick = useSetWatchedValue('ShowDeleteDirectoryOrFileModal', true);
	const onRedeployClick = useSetWatchedValue('ShowRedeployApplicationModal', true);
	const onSaveClick = useEmitToListeners('SaveFile', true);
	const onRevertChangesClicked = useEmitToListeners('RevertChanges', true);

	const fileIsClean = updatedFileContent === undefined || updatedFileContent === openedEntryContents;

	if (!openedEntry) {
		return null;
	}

	return <div className="absolute top-0 right-0 left-0 backdrop-blur-sm bg-black-10 shadow-xl flex pr-4 md:pr-12 -mr-1">

		{!isDirectory(openedEntry) && !openedEntry.package && canManageBrowseInstance && <Button
			variant="default"
			className="rounded-none"
			onClick={onSaveClick}
			disabled={fileIsClean || isSavingFile}
		>
			<SaveIcon />
			<span className="hidden lg:inline-block"><u>S</u>ave</span>
		</Button>}

		{!isDirectory(openedEntry) && !openedEntry.package && canManageBrowseInstance && <Button
			variant="ghost"
			className="rounded-none"
			onClick={onRenameClick}
			disabled={!fileIsClean || isSavingFile}
		>
			<PencilIcon />
			<span className="hidden lg:inline-block"><u>R</u>ename</span>
		</Button>}

		{!openedEntry.package && canManageBrowseInstance && <Button
			variant="ghost"
			className="rounded-none"
			onClick={onAddFileClick}
		>
			<FileIcon />
			<span className="hidden lg:inline-block"><u>N</u>ew File</span>
		</Button>}

		{!openedEntry.package && canManageBrowseInstance && <Button
			variant="ghost"
			className="rounded-none"
			onClick={onAddDirectoryClick}
		>
			<FolderIcon />
			<span className="hidden lg:inline-block"><u>A</u>dd Directory</span>
		</Button>}

		{!!openedEntry.package && canManageBrowseInstance && !restrictPackageModification &&
			<Button
				variant="ghost"
				className="rounded-none"
				onClick={onRedeployClick}
			>
				<PackageIcon />
				<span>Redeploy <u>P</u>ackage</span>
			</Button>}

		<div className="grow"></div>

		{canManageBrowseInstance && <RestartButton
			targetNoun={targetNoun}
			instanceClient={instanceParams.instanceClient}
			operation="restart_service"
			variant="ghost"
			className="rounded-none mx-0 md:mx-0"
			disabled={!fileIsClean || isSavingFile}
		/>}

		{!isDirectory(openedEntry) && !openedEntry.package && canManageBrowseInstance && <Button
			variant="ghost"
			className="rounded-none"
			onClick={onRevertChangesClicked}
			disabled={fileIsClean || isSavingFile}
		>
			<Undo2Icon />
			<span className="hidden xl:inline-block">Revert Changes</span>
		</Button>}

		{!restrictPackageModification && canManageBrowseInstance && <Button
			variant="destructiveGhost"
			className="rounded-none"
			onClick={onDeleteClick}
		>
			<TrashIcon />
			<span className="hidden xl:inline-block"><u>D</u>elete</span>
		</Button>}
	</div>;
}
