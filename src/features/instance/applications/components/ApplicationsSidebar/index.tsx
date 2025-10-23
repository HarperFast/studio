import { buildItems } from '@/features/instance/applications/components/ApplicationsSidebar/buildItems';
import { getItemTitle } from '@/features/instance/applications/components/ApplicationsSidebar/getItemTitle';
import { ItemTitle } from '@/features/instance/applications/components/ApplicationsSidebar/ItemTitle';
import type { DirectoryEntry } from '@/features/instance/applications/context/directoryEntry';
import type { FileEntry } from '@/features/instance/applications/context/fileEntry';
import { useEditorView } from '@/features/instance/applications/hooks/useEditorView';
import { useRenameFiles } from '@/features/instance/applications/hooks/useRenameFiles';
import { extractFileNameFromPath } from '@/lib/string/paths/extractFileNameFromPath';
import { joinPath } from '@/lib/string/paths/joinPath';
import { renameFileInPath } from '@/lib/string/paths/renameFileInPath';
import { useCallback, useEffect, useMemo } from 'react';
import { ControlledTreeEnvironment, Tree, TreeItem } from 'react-complex-tree';
import './file-explorer-modern.css';
import { DraggingPosition } from 'react-complex-tree/src/types';
import { toast } from 'sonner';

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

	useEffect(function setOpenedEntryFromFocusedItem() {
		if (openedEntry?.path !== focusedItem && focusedItem) {
			const item = items[focusedItem];
			const entry = item?.data as DirectoryEntry | FileEntry | undefined;
			if (entry) {
				setOpenedEntry(entry);
			}
		}
	}, [openedEntry, focusedItem, items]);

	const renameFiles = useRenameFiles();
	const onDrop = useCallback((droppedItems: TreeItem<FileEntry | DirectoryEntry | null>[], target: DraggingPosition) => {
		switch (target.targetType) {
			case 'item':
				if (items[target.targetItem]?.data?.package) {
					toast.error('Read-Only Imported Application', {
						description: 'To make changes to an application, please click the "Redeploy" button and update the' +
							' reference.',
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
	}, [items]);
	const onRenameItem = useCallback((item: TreeItem<FileEntry | DirectoryEntry | null>, name: string) => {
		if (item.data) {
			return renameFiles([
				{
					from: item.data.path,
					to: renameFileInPath(item.data.path, name),
				},
			]);
		}
	}, [renameFiles]);

	return (
		<div className="h-full overflow-auto pr-1.5">
			<ControlledTreeEnvironment
				canDragAndDrop={true}
				canDropOnFolder={true}
				canDropOnNonFolder={false}
				canReorderItems={false}
				canSearch={true}
				getItemTitle={(item) => getItemTitle(item)}
				items={items}
				onDrop={onDrop}
				onRenameItem={onRenameItem}
				renderItemTitle={ItemTitle}
				viewState={{ applicationsTree: { focusedItem, expandedItems, selectedItems } }}
				onFocusItem={item => setFocusedItem(item.index)}
				onExpandItem={item => setExpandedItems([...expandedItems, item.index])}
				onCollapseItem={item =>
					setExpandedItems(expandedItems.filter(expandedItemIndex => expandedItemIndex !== item.index))
				}
				onSelectItems={items => setSelectedItems(items)}
			>
				<Tree treeId="applicationsTree" rootItem={rootId} treeLabel="Applications file tree" />
			</ControlledTreeEnvironment>
		</div>
	);
}
