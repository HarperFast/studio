import type { DirectoryEntry } from '@/features/instance/applications/context/directoryEntry';
import type { FileEntry } from '@/features/instance/applications/context/fileEntry';
import { isDirectory } from '@/features/instance/applications/context/isDirectory';
import { isProtectedPath } from '@/features/instance/applications/context/isProtectedComponentPackage';
import { useEditorView } from '@/features/instance/applications/hooks/useEditorView';
import { useRenameFiles } from '@/features/instance/applications/hooks/useRenameFiles';
import { confirmOverwrite } from '@/features/instance/applications/modals/confirmOverwrite';
import { useGlobalShortcutKeys } from '@/features/instance/applications/shortcuts';
import { useListener } from '@/lib/events/listener';
import { extractFileNameFromPath } from '@/lib/string/paths/extractFileNameFromPath';
import { joinPath } from '@/lib/string/paths/joinPath';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { ControlledTreeEnvironment, InteractionMode, Tree, TreeItem } from 'react-complex-tree';
import './file-explorer-modern.css';
import { DraggingPosition } from 'react-complex-tree/src/types';
import { toast } from 'sonner';
import { buildItems } from './buildItems';
import { DropTarget } from './DropTarget';
import { FileTreeContextMenu } from './FileTreeContextMenu';
import { getItemTitle } from './getItemTitle';
import { ItemArrow } from './ItemArrow';
import { ItemTitle } from './ItemTitle';

export function ApplicationsSidebar() {
	const {
		rootEntries,
		openedEntry,
		setOpenedEntry,
		focusedItem,
		setFocusedItem,
		expandedItems,
		setExpandedItems,
		selectedItems,
		setSelectedItems,
		entryExists,
	} = useEditorView();
	const { items, rootId } = useMemo(() => buildItems(rootEntries), [rootEntries]);

	useGlobalShortcutKeys();

	// Move DOM focus into the tree after a modal closes (e.g. adding a directory, or
	// deleting an entry and falling back to its parent). The row to land on is whatever
	// the modal set as `focusedItem`; deferred a frame so it runs after the tree re-renders
	// from the reload. Falls back to the tree container if the specific row isn't mounted.
	const treeScrollRef = useRef<HTMLDivElement>(null);
	useListener(
		'FocusFileTree',
		() => {
			requestAnimationFrame(() => {
				const container = treeScrollRef.current;
				if (!container) {
					return;
				}
				const row = focusedItem
					? container.querySelector<HTMLElement>(`[data-rct-item-id="${CSS.escape(String(focusedItem))}"]`)
					: null;
				const target = row ?? container.querySelector<HTMLElement>('[role="tree"]');
				target?.focus();
				row?.scrollIntoView({ block: 'nearest' });
			});
		},
		[focusedItem],
	);

	useEffect(function setOpenedEntryFromFocusedItem() {
		if (openedEntry?.path !== focusedItem && focusedItem) {
			const item = items[focusedItem];
			const entry = item?.data as DirectoryEntry | FileEntry | undefined;
			if (entry) {
				setOpenedEntry(entry);
			}
		}
	}, [focusedItem, items, openedEntry?.path, setOpenedEntry]);

	const renameFiles = useRenameFiles();
	const onInternalDrop = useCallback(
		async (droppedItems: TreeItem<FileEntry | DirectoryEntry | undefined>[], target: DraggingPosition) => {
			if (droppedItems.some(item => isProtectedPath(rootEntries, String(item.index)))) {
				toast.error('Move refused', {
					description: 'That component is managed by Harper and keeps this instance in the load balancer.',
				});
				return;
			}
			switch (target.targetType) {
				case 'item': {
					if (items[target.targetItem]?.data?.package) {
						toast.error('Read-Only Imported Application', {
							description: 'To make changes to an application, please click the "Redeploy" button and update the'
								+ ' reference.',
						});
						return;
					}
					const changes = droppedItems.map(item => ({
						from: item.index as string,
						to: joinPath(target.targetItem as string, extractFileNameFromPath(item.index as string)),
					}));
					// Confirm before clobbering anything already at a destination path (files are
					// overwritten, directories merged) instead of silently failing the move.
					const collidingFiles: string[] = [];
					const collidingDirectories: string[] = [];
					for (const change of changes) {
						if (change.from !== change.to && entryExists(change.to)) {
							const existing = items[change.to]?.data;
							(existing && isDirectory(existing) ? collidingDirectories : collidingFiles).push(change.to);
						}
					}
					if (collidingFiles.length || collidingDirectories.length) {
						const confirmed = await confirmOverwrite({ files: collidingFiles, directories: collidingDirectories });
						if (!confirmed) {
							return;
						}
					}
					return renameFiles(changes);
				}
				default:
					toast.error(`${target.targetType} drop not yet supported`);
					break;
			}
		},
		[entryExists, items, renameFiles, rootEntries],
	);

	return (
		<div ref={treeScrollRef} className="app-tree-scroll h-full overflow-auto pr-1.5 pb-18">
			<FileTreeContextMenu items={items}>
				<ControlledTreeEnvironment
					canDragAndDrop={true}
					canDropOnFolder={true}
					canDropOnNonFolder={false}
					canReorderItems={false}
					canSearch={true}
					canRename={false}
					defaultInteractionMode={InteractionMode.DoubleClickItemToExpand}
					getItemTitle={getItemTitle}
					items={items}
					onDrop={onInternalDrop}
					renderItemArrow={ItemArrow}
					renderItemTitle={ItemTitle}
					viewState={{ applicationsTree: { focusedItem, expandedItems, selectedItems } }}
					onFocusItem={item => setFocusedItem(item.index)}
					onExpandItem={item => setExpandedItems([...expandedItems, item.index])}
					onCollapseItem={item =>
						setExpandedItems(expandedItems.filter(expandedItemIndex => expandedItemIndex !== item.index))}
					onSelectItems={items => setSelectedItems(items)}
				>
					<Tree treeId="applicationsTree" rootItem={rootId} treeLabel="Applications file tree" />
				</ControlledTreeEnvironment>
			</FileTreeContextMenu>

			<DropTarget />
		</div>
	);
}
