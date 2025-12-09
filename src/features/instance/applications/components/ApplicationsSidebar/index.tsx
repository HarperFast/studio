import type { DirectoryEntry } from '@/features/instance/applications/context/directoryEntry';
import type { FileEntry } from '@/features/instance/applications/context/fileEntry';
import { useEditorView } from '@/features/instance/applications/hooks/useEditorView';
import { useRenameFiles } from '@/features/instance/applications/hooks/useRenameFiles';
import { useGlobalShortcutKeys } from '@/features/instance/applications/shortcuts';
import { extractFileNameFromPath } from '@/lib/string/paths/extractFileNameFromPath';
import { joinPath } from '@/lib/string/paths/joinPath';
import { useCallback, useEffect, useMemo } from 'react';
import { ControlledTreeEnvironment, Tree, TreeItem } from 'react-complex-tree';
import './file-explorer-modern.css';
import { DraggingPosition } from 'react-complex-tree/src/types';
import { toast } from 'sonner';
import { buildItems } from './buildItems';
import { DropTarget } from './DropTarget';
import { getItemTitle } from './getItemTitle';
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
	} = useEditorView();
	const { items, rootId } = useMemo(() => buildItems(rootEntries), [rootEntries]);

	useGlobalShortcutKeys();

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
		(droppedItems: TreeItem<FileEntry | DirectoryEntry | undefined>[], target: DraggingPosition) => {
			switch (target.targetType) {
				case 'item':
					if (items[target.targetItem]?.data?.package) {
						toast.error('Read-Only Imported Application', {
							description: 'To make changes to an application, please click the "Redeploy" button and update the'
								+ ' reference.',
						});
					} else {
						return renameFiles(droppedItems.map(item => ({
							from: item.index as string,
							to: joinPath(target.targetItem as string, extractFileNameFromPath(item.index as string)),
						})));
					}
					break;
				default:
					toast.error(`${target.targetType} drop not yet supported`);
					break;
			}
		},
		[items, renameFiles],
	);

	return (
		<div className="h-full overflow-auto pr-1.5 pb-18">
			<ControlledTreeEnvironment
				canDragAndDrop={true}
				canDropOnFolder={true}
				canDropOnNonFolder={false}
				canReorderItems={false}
				canSearch={true}
				canRename={false}
				getItemTitle={getItemTitle}
				items={items}
				onDrop={onInternalDrop}
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

			<DropTarget />
		</div>
	);
}
