import { buildItems } from '@/features/instance/applications/components/ApplicationsSidebar/buildItems';
import { getItemTitle } from '@/features/instance/applications/components/ApplicationsSidebar/getItemTitle';
import type { DirectoryEntry } from '@/features/instance/applications/context/directoryEntry';
import type { FileEntry } from '@/features/instance/applications/context/fileEntry';
import { useEditorView } from '@/features/instance/applications/hooks/useEditorView';
import { useCallback, useMemo, useState } from 'react';
import { ControlledTreeEnvironment, Tree, type TreeItem } from 'react-complex-tree';
import './file-explorer-modern.css';
import { TreeItemIndex } from 'react-complex-tree/src/types';

export function ApplicationsSidebar() {
	const { rootEntries, setOpenedEntry } = useEditorView();

	const [focusedItem, setFocusedItem] = useState<TreeItemIndex | undefined>();
	const [expandedItems, setExpandedItems] = useState<TreeItemIndex[]>([]);
	const [selectedItems, setSelectedItems] = useState<TreeItemIndex[]>([]);

	const { items, rootId } = useMemo(() => buildItems(rootEntries), [rootEntries]);

	const onPrimaryAction = useCallback((item: TreeItem<DirectoryEntry | FileEntry | null>) => {
		// Open files on activation; directories toggle expansion automatically
		const entry = item.data as DirectoryEntry | FileEntry | undefined;
		if (entry) {
			setOpenedEntry(entry);
		}
	}, [setOpenedEntry]);

	// TODO: onRenameItem
	// TODO: onDrop
	return (
		<div className="h-full overflow-auto pr-1">
			<ControlledTreeEnvironment
				items={items}
				getItemTitle={(item) => getItemTitle(item)}
				canDragAndDrop={true}
				canReorderItems={false}
				canSearch={true}
				viewState={{
					['applicationsTree']: {
						focusedItem,
						expandedItems,
						selectedItems,
					},
				}}
				onFocusItem={item => setFocusedItem(item.index)}
				onExpandItem={item => setExpandedItems([...expandedItems, item.index])}
				onCollapseItem={item =>
					setExpandedItems(expandedItems.filter(expandedItemIndex => expandedItemIndex !== item.index))
				}
				onSelectItems={items => setSelectedItems(items)}
				onPrimaryAction={onPrimaryAction}
			>
				<Tree treeId="applicationsTree" rootItem={rootId} treeLabel="Applications file tree" />
			</ControlledTreeEnvironment>
		</div>
	);
}
