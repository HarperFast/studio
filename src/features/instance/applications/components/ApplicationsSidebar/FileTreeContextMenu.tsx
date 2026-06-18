import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuShortcut,
	ContextMenuTrigger,
} from '@/components/ui/contextMenu';
import type { DirectoryEntry } from '@/features/instance/applications/context/directoryEntry';
import type { FileEntry } from '@/features/instance/applications/context/fileEntry';
import { useEditorView } from '@/features/instance/applications/hooks/useEditorView';
import { useEntryActions } from '@/features/instance/applications/hooks/useEntryActions';
import { setWatchedValue } from '@/lib/events/watcher';
import { DownloadIcon, FilePlusIcon, FolderPlusIcon, PackageIcon, PencilIcon, TrashIcon } from 'lucide-react';
import { ReactNode, useCallback, useState } from 'react';
import type { TreeItem, TreeItemIndex } from 'react-complex-tree';
import { importedApplications, newApplication, rootId } from './specialItems';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
// Mirrors the labels shown in the editor menu bar (see ContentActions).
const SHORTCUTS = {
	rename: 'F2',
	newFile: isMac ? '⌃N' : 'Ctrl+N',
	newDirectory: isMac ? '⌃⌥⇧N' : 'Ctrl+Alt+Shift+N',
	delete: isMac ? '⌘⌦' : 'Ctrl+Del',
};

interface ContextTarget {
	entry: DirectoryEntry | FileEntry;
	id: string;
	/** What a delete should span — the live multi-selection if the row is part of it. */
	selection: TreeItemIndex[];
}

/**
 * Wraps the file tree with a right-click context menu. Resolves which row was
 * clicked (react-complex-tree tags each row with `data-rct-item-id`) and makes it
 * the editor's opened/selected entry, then fires the same `setWatchedValue`
 * triggers the menu bar uses — reusing the existing modals. Synthetic nodes (the
 * "New Application" entry, the imported-applications root) and empty space below
 * the tree don't open a menu.
 */
export function FileTreeContextMenu({
	items,
	children,
}: {
	items: Record<string, TreeItem<DirectoryEntry | FileEntry | undefined>>;
	children: ReactNode;
}) {
	const { setOpenedEntry, setFocusedItem, setSelectedItems, selectedItems } = useEditorView();
	const [target, setTarget] = useState<ContextTarget | undefined>(undefined);
	const { canRename, canAddEntries, canDeleteEntry, canDownload, canRedeploy } = useEntryActions(target?.entry);

	const focusTarget = useCallback((next: ContextTarget) => {
		setOpenedEntry(next.entry);
		setFocusedItem(next.id);
		setSelectedItems(next.selection);
	}, [setOpenedEntry, setFocusedItem, setSelectedItems]);

	const onContextMenu = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
		const id = (event.target as HTMLElement).closest('[data-rct-item-id]')?.getAttribute('data-rct-item-id');
		const entry = id ? items[id]?.data : undefined;
		if (!id || !entry || !entry.project || id === rootId || id === newApplication || id === importedApplications) {
			// Suppress the menu on empty space / synthetic nodes. Calling
			// preventDefault here stops Radix's own trigger handler from opening it.
			event.preventDefault();
			return;
		}
		// Keep an existing multi-selection if the clicked row is part of it (so a
		// multi-delete still spans every selected row); otherwise select just this one.
		const next: ContextTarget = { entry, id, selection: selectedItems.includes(id) ? selectedItems : [id] };
		setTarget(next);
		focusTarget(next);
	}, [items, selectedItems, focusTarget]);

	// Re-assert the target as the action fires. This runs in the same React batch
	// as opening the modal, so the modal always reads the right-clicked entry even
	// though focus shifts when the menu closes.
	const act = useCallback((fire: () => void) => {
		if (target) {
			focusTarget(target);
		}
		fire();
	}, [target, focusTarget]);

	const hasActions = canAddEntries || canRename || canDownload || canRedeploy || canDeleteEntry;

	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>
				<div onContextMenu={onContextMenu} className="min-h-full">
					{children}
				</div>
			</ContextMenuTrigger>
			{hasActions && (
				<ContextMenuContent className="min-w-44" onCloseAutoFocus={event => event.preventDefault()}>
					{canAddEntries && (
						<>
							<ContextMenuItem onSelect={() => act(() => setWatchedValue('ShowAddDirectoryOrFileModalType', 'file'))}>
								<FilePlusIcon />
								New File
								<ContextMenuShortcut>{SHORTCUTS.newFile}</ContextMenuShortcut>
							</ContextMenuItem>
							<ContextMenuItem
								onSelect={() => act(() => setWatchedValue('ShowAddDirectoryOrFileModalType', 'directory'))}
							>
								<FolderPlusIcon />
								Add Directory
								<ContextMenuShortcut>{SHORTCUTS.newDirectory}</ContextMenuShortcut>
							</ContextMenuItem>
						</>
					)}

					{canRename && (
						<ContextMenuItem onSelect={() => act(() => setWatchedValue('ShowRenameFileModal', true))}>
							<PencilIcon />
							Rename
							<ContextMenuShortcut>{SHORTCUTS.rename}</ContextMenuShortcut>
						</ContextMenuItem>
					)}

					{canDownload && (
						<ContextMenuItem onSelect={() => act(() => setWatchedValue('ShowDownloadApplicationModal', true))}>
							<DownloadIcon />
							Download Application
						</ContextMenuItem>
					)}

					{canRedeploy && (
						<ContextMenuItem onSelect={() => act(() => setWatchedValue('ShowRedeployApplicationModal', true))}>
							<PackageIcon />
							Redeploy Package
						</ContextMenuItem>
					)}

					{(canAddEntries || canRename || canDownload || canRedeploy) && canDeleteEntry && <ContextMenuSeparator />}

					{canDeleteEntry && (
						<ContextMenuItem
							variant="destructive"
							onSelect={() => act(() => setWatchedValue('ShowDeleteDirectoryOrFileModal', true))}
						>
							<TrashIcon />
							Delete
							<ContextMenuShortcut>{SHORTCUTS.delete}</ContextMenuShortcut>
						</ContextMenuItem>
					)}
				</ContextMenuContent>
			)}
		</ContextMenu>
	);
}
