import { Button } from '@/components/ui/button';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from '@/components/ui/dropdownMenu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { useEditorFileContent } from '@/features/instance/applications/context/editorFileContent';
import { isDirectory } from '@/features/instance/applications/context/isDirectory';
import { useEditorView } from '@/features/instance/applications/hooks/useEditorView';
import { useInstanceBrowseManagePermission } from '@/hooks/usePermissions';
import { useRestartInstanceClick } from '@/hooks/useRestartInstanceClick';
import { emitToListeners, useEmitToListeners } from '@/lib/events/listener';
import { useSetWatchedValue, useWatchedValue } from '@/lib/events/watcher';
import {
	ArrowLeftIcon,
	ArrowRightIcon,
	CaseSensitiveIcon,
	ChevronDownIcon,
	DownloadIcon,
	FilePlusIcon,
	FolderPlusIcon,
	LockIcon,
	PackageIcon,
	PanelRightCloseIcon,
	PanelRightOpenIcon,
	PencilIcon,
	PlusIcon,
	RotateCcwIcon,
	SaveIcon,
	TrashIcon,
	Undo2Icon,
} from 'lucide-react';
import { Fragment } from 'react';
import { newApplication } from './ApplicationsSidebar/specialItems';
import {
	CASE_TRANSFORM_COMMANDS,
	EDIT_MENU_SECTIONS,
	type EditorMenuCommand,
	GO_MENU_SECTIONS,
} from './editorMenuCommands';
import { useEditorShortcutLabels } from './editorShortcutLabels';

import './ContentActions.css';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
// Mirrors the bindings registered in `../shortcuts`; shown so the menus teach
// the keys. macOS gets the conventional symbols, everything else spells it out.
const SHORTCUTS = {
	save: isMac ? '⌘S' : 'Ctrl+S',
	rename: 'F2',
	newFile: isMac ? '⌃N' : 'Ctrl+N',
	newDirectory: isMac ? '⌃⌥⇧N' : 'Ctrl+Alt+Shift+N',
	delete: isMac ? '⌘⌦' : 'Ctrl+Del',
};

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
	const { onRestartClick, isRestartPending } = useRestartInstanceClick({
		operation: 'restart_service',
		instanceClient: instanceParams.instanceClient,
	});

	const onAddFileClick = useSetWatchedValue('ShowAddDirectoryOrFileModalType', 'file');
	const onAddDirectoryClick = useSetWatchedValue('ShowAddDirectoryOrFileModalType', 'directory');
	const onDownloadApplicationClick = useSetWatchedValue('ShowDownloadApplicationModal', true);
	const onRenameClick = useSetWatchedValue('ShowRenameFileModal', true);
	const onDeleteClick = useSetWatchedValue('ShowDeleteDirectoryOrFileModal', true);
	const onRedeployClick = useSetWatchedValue('ShowRedeployApplicationModal', true);
	const onSaveClick = useEmitToListeners('SaveFile', true);
	const onRevertChangesClicked = useEmitToListeners('RevertChanges', true);
	const onNewTableClick = useEmitToListeners('ShowNewTableModal', true);
	const onNavigateBackClick = useEmitToListeners('NavigateBack', true);
	const onNavigateForwardClick = useEmitToListeners('NavigateForward', true);
	const canNavigateBack = useWatchedValue('CanNavigateBack', false).value;
	const canNavigateForward = useWatchedValue('CanNavigateForward', false).value;
	const editorCommandShortcuts = useEditorShortcutLabels();

	const fileIsClean = updatedFileContent === undefined || updatedFileContent === openedEntryContents;

	const renderCommandItem = (command: EditorMenuCommand) => {
		const Icon = command.icon;
		const shortcut = editorCommandShortcuts[command.id];
		return (
			<DropdownMenuItem key={command.id} onSelect={() => emitToListeners('RunEditorAction', command.id)}>
				<Icon />
				{command.label}
				{shortcut && <DropdownMenuShortcut>{shortcut}</DropdownMenuShortcut>}
			</DropdownMenuItem>
		);
	};
	const renderCommandSections = (sections: EditorMenuCommand[][]) =>
		sections.map((section, index) => (
			<Fragment key={index}>
				{index > 0 && <DropdownMenuSeparator />}
				{section.map(renderCommandItem)}
			</Fragment>
		));

	// Which actions apply to what is open — drives both the menu items and
	// whether each parent menu appears at all.
	const isReadOnlyPackage = !!openedEntry?.package;
	const canEditFile = !!openedEntry && !isDirectory(openedEntry) && !isReadOnlyPackage && canManageBrowseInstance;
	const canAddEntries = !!openedEntry && !isReadOnlyPackage && canManageBrowseInstance;
	const canAddTable = !!openedEntry && openedEntry.path.endsWith('.graphql') && canManageBrowseInstance;
	const canDeleteEntry = !restrictPackageModification && canManageBrowseInstance;
	const canDownload = !!openedEntry?.project;
	const canRedeploy = isReadOnlyPackage && canManageBrowseInstance && !restrictPackageModification;

	const showFileMenu = canEditFile || canAddEntries || canAddTable || canDeleteEntry;
	const showApplicationMenu = canDownload || canManageBrowseInstance || canRedeploy;

	return (
		<div className="absolute top-0 right-0 left-0 backdrop-blur-sm bg-black-10 shadow-xl flex pr-4 md:pr-12">
			<Button
				type="button"
				variant="ghost"
				className={(toggledSidebar ? 'toggled-sidebar-toggler' : 'hidden-sidebar-toggler')
					+ ' inline-flex'
					+ ' text-sm md:hidden'
					+ ' focus:outline-none'
					+ ' focus:ring-2'
					+ ' text-foreground'
					+ ' hover:text-muted-foreground focus:ring-gray-600 rounded-none'}
				onClick={toggleSidebar}
			>
				<span className="sr-only">{toggledSidebar ? 'Close' : 'Open'} sidebar</span>
				{toggledSidebar ? <PanelRightOpenIcon /> : <PanelRightCloseIcon />}
			</Button>

			{openedEntry && openedEntry?.path !== newApplication && (
				<>
					<Button
						type="button"
						variant="ghost"
						className="rounded-none px-2"
						onClick={onNavigateBackClick}
						disabled={!canNavigateBack}
						title="Go Back"
					>
						<ArrowLeftIcon className="pointer-events-none" />
						<span className="sr-only">Go Back</span>
					</Button>
					<Button
						type="button"
						variant="ghost"
						className="rounded-none px-2"
						onClick={onNavigateForwardClick}
						disabled={!canNavigateForward}
						title="Go Forward"
					>
						<ArrowRightIcon className="pointer-events-none" />
						<span className="sr-only">Go Forward</span>
					</Button>

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

					{showFileMenu && (
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button type="button" variant="ghost" className="rounded-none" title="File">
									File
									{!fileIsClean && canEditFile && (
										<span className="ml-1 size-1.5 rounded-full bg-primary" aria-label="Unsaved changes" />
									)}
									<ChevronDownIcon className="pointer-events-none opacity-60" />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="start">
								{canEditFile && (
									<>
										<DropdownMenuItem onSelect={onSaveClick} disabled={fileIsClean || isSavingFile}>
											<SaveIcon />
											Save
											<DropdownMenuShortcut>{SHORTCUTS.save}</DropdownMenuShortcut>
										</DropdownMenuItem>
										<DropdownMenuItem onSelect={onRenameClick} disabled={!fileIsClean || isSavingFile}>
											<PencilIcon />
											Rename
											<DropdownMenuShortcut>{SHORTCUTS.rename}</DropdownMenuShortcut>
										</DropdownMenuItem>
										<DropdownMenuItem onSelect={onRevertChangesClicked} disabled={fileIsClean || isSavingFile}>
											<Undo2Icon />
											Revert
										</DropdownMenuItem>
									</>
								)}

								{canEditFile && (canAddEntries || canAddTable) && <DropdownMenuSeparator />}

								{canAddEntries && (
									<>
										<DropdownMenuItem onSelect={onAddFileClick}>
											<FilePlusIcon />
											New File
											<DropdownMenuShortcut>{SHORTCUTS.newFile}</DropdownMenuShortcut>
										</DropdownMenuItem>
										<DropdownMenuItem onSelect={onAddDirectoryClick}>
											<FolderPlusIcon />
											Add Directory
											<DropdownMenuShortcut>{SHORTCUTS.newDirectory}</DropdownMenuShortcut>
										</DropdownMenuItem>
									</>
								)}
								{canAddTable && (
									<DropdownMenuItem onSelect={onNewTableClick}>
										<PlusIcon />
										New Table
									</DropdownMenuItem>
								)}

								{(canEditFile || canAddEntries || canAddTable) && canDeleteEntry && <DropdownMenuSeparator />}

								{canDeleteEntry && (
									<DropdownMenuItem variant="destructive" onSelect={onDeleteClick}>
										<TrashIcon />
										Delete
										<DropdownMenuShortcut>{SHORTCUTS.delete}</DropdownMenuShortcut>
									</DropdownMenuItem>
								)}
							</DropdownMenuContent>
						</DropdownMenu>
					)}

					{canEditFile && (
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button type="button" variant="ghost" className="rounded-none" title="Edit">
									Edit
									<ChevronDownIcon className="pointer-events-none opacity-60" />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="start">
								{renderCommandSections(EDIT_MENU_SECTIONS)}
								<DropdownMenuSeparator />
								<DropdownMenuSub>
									<DropdownMenuSubTrigger>
										<CaseSensitiveIcon />
										Transform Case
									</DropdownMenuSubTrigger>
									<DropdownMenuSubContent>
										{CASE_TRANSFORM_COMMANDS.map(renderCommandItem)}
									</DropdownMenuSubContent>
								</DropdownMenuSub>
							</DropdownMenuContent>
						</DropdownMenu>
					)}

					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button type="button" variant="ghost" className="rounded-none" title="Go">
								Go
								<ChevronDownIcon className="pointer-events-none opacity-60" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="start">
							{renderCommandSections(GO_MENU_SECTIONS)}
						</DropdownMenuContent>
					</DropdownMenu>

					{showApplicationMenu && (
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button type="button" variant="ghost" className="rounded-none" title="Application">
									Application
									<ChevronDownIcon className="pointer-events-none opacity-60" />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="start">
								{canDownload && (
									<DropdownMenuItem onSelect={onDownloadApplicationClick}>
										<DownloadIcon />
										Download
									</DropdownMenuItem>
								)}
								{canManageBrowseInstance && (
									<DropdownMenuItem
										onSelect={onRestartClick}
										disabled={!fileIsClean || isSavingFile || isRestartPending}
										title="Restarts all service threads to apply changes. No downtime expected."
									>
										<RotateCcwIcon />
										Restart
									</DropdownMenuItem>
								)}
								{(canDownload || canManageBrowseInstance) && canRedeploy && <DropdownMenuSeparator />}
								{canRedeploy && (
									<DropdownMenuItem onSelect={onRedeployClick}>
										<PackageIcon />
										Redeploy Package
									</DropdownMenuItem>
								)}
							</DropdownMenuContent>
						</DropdownMenu>
					)}
				</>
			)}
		</div>
	);
}
