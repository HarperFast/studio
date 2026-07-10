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
import { useCopyTextToClipboard } from '@/hooks/useCopyToClipboard';
import { setWatchedValue } from '@/lib/events/watcher';
import {
	CopyIcon,
	DownloadIcon,
	FilePlusIcon,
	FolderPlusIcon,
	LinkIcon,
	PackageIcon,
	PencilIcon,
	TrashIcon,
} from 'lucide-react';
import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import type { TreeItem, TreeItemIndex } from 'react-complex-tree';
import { setPendingContextAction } from '../../shortcuts/pendingContextAction';
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
 * clicked (react-complex-tree tags each row with `data-rct-item-id`) and remembers
 * it as the menu's target, then fires the same `setWatchedValue` triggers the menu
 * bar uses — reusing the existing modals. Right-clicking does NOT select or open
 * the row (only a left click does that); selection only shifts to the target when
 * an action is actually invoked (see `act`), so the modal operates on it. Synthetic
 * nodes (the "New Application" entry, the imported-applications root) and empty
 * space below the tree don't open a menu.
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
	// Bumped to the cursor position on every right-click so the content remounts and re-anchors there
	// (see onContextMenu) -- without it Radix leaves an already-open menu at its first position.
	const [anchorKey, setAnchorKey] = useState('');
	const { canRename, canAddEntries, canDeleteEntry, canDownload, canRedeploy } = useEntryActions(target?.entry);

	const focusTarget = useCallback((next: ContextTarget) => {
		setOpenedEntry(next.entry);
		setFocusedItem(next.id);
		setSelectedItems(next.selection);
	}, [setOpenedEntry, setFocusedItem, setSelectedItems]);

	// While the menu is open, let a keyboard shortcut (e.g. Cmd+Delete) act on the
	// right-clicked row instead of the background selection — without right-click
	// itself changing the selection. `targetRef` keeps the latest target so the
	// registered applier never goes stale.
	const targetRef = useRef(target);
	targetRef.current = target;
	const [menuOpen, setMenuOpen] = useState(false);
	useEffect(() => {
		if (!menuOpen) {
			return;
		}
		setPendingContextAction(() => {
			const current = targetRef.current;
			if (current) {
				focusTarget(current);
			}
		});
		return () => setPendingContextAction(undefined);
	}, [menuOpen, focusTarget]);

	const onContextMenu = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
		const id = (event.target as HTMLElement).closest('[data-rct-item-id]')?.getAttribute('data-rct-item-id');
		const entry = id ? items[id]?.data : undefined;
		if (!id || !entry || !entry.project || id === rootId || id === newApplication || id === importedApplications) {
			// Suppress the menu on empty space / synthetic nodes. Calling
			// preventDefault here stops Radix's own trigger handler from opening it.
			event.preventDefault();
			return;
		}
		// Remember the right-clicked row as the menu target WITHOUT selecting/opening
		// it — that only happens on a left click (or when an action runs, via `act`).
		// Keep an existing multi-selection if the clicked row is part of it (so a
		// multi-delete still spans every selected row); otherwise target just this one.
		const next: ContextTarget = { entry, id, selection: selectedItems.includes(id) ? selectedItems : [id] };
		setTarget(next);
		// Radix keeps an already-open context menu anchored to its first position (its exit animation
		// prevents a re-measure on reopen), so remount the content -- keyed by the cursor point -- to
		// force it to re-anchor where you actually right-clicked.
		setAnchorKey(`${event.clientX},${event.clientY}`);
	}, [items, selectedItems]);

	// Re-assert the target as the action fires. This runs in the same React batch
	// as opening the modal, so the modal always reads the right-clicked entry even
	// though focus shifts when the menu closes.
	const act = useCallback((fire: () => void) => {
		if (target) {
			focusTarget(target);
		}
		fire();
	}, [target, focusTarget]);

	// Copy is always available (it reads the right-clicked entry, needs no permission and
	// changes no selection), so it reads `target` directly rather than going through `act`.
	const copy = useCopyTextToClipboard();

	const hasActions = canAddEntries || canRename || canDownload || canRedeploy || canDeleteEntry;

	return (
		// `modal={false}` (matching the editor menu bar in ContentActions) keeps the menu from
		// locking `pointer-events: none` onto <body> while open. A modal menu sets that lock and
		// relies on its own teardown to lift it — but every action here opens a dialog as the menu
		// closes, and Radix's body-pointer-events bookkeeping desyncs across the menu's and dialog's
		// separate dismissable-layer instances, leaving the lock stuck after the dialog closes and
		// freezing the whole page. Non-modal never touches body pointer events, sidestepping it.
		// `onOpenChange` tracks the open state so a keyboard shortcut fired while the menu is open
		// can act on the right-clicked row (see the menuOpen effect above).
		<ContextMenu modal={false} onOpenChange={setMenuOpen}>
			<ContextMenuTrigger asChild>
				<div onContextMenu={onContextMenu} className="min-h-full">
					{children}
				</div>
			</ContextMenuTrigger>
			{target && (
				<ContextMenuContent
					key={anchorKey}
					className="min-w-44"
					onCloseAutoFocus={event => event.preventDefault()}
				>
					<ContextMenuItem onSelect={() => copy(target.entry.name)}>
						<CopyIcon />
						Copy Name
					</ContextMenuItem>
					<ContextMenuItem onSelect={() => copy(target.entry.path)}>
						<LinkIcon />
						Copy Path
					</ContextMenuItem>

					{hasActions && <ContextMenuSeparator />}

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
