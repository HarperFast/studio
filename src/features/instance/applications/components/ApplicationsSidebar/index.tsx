import { buildItems } from '@/features/instance/applications/components/ApplicationsSidebar/buildItems';
import {
	DirectoryIcon,
} from '@/features/instance/applications/components/ApplicationsSidebar/FileTreeExplorer/DirectoryIcon';
import { getItemTitle } from '@/features/instance/applications/components/ApplicationsSidebar/getItemTitle';
import type { DirectoryEntry } from '@/features/instance/applications/context/directoryEntry';
import type { FileEntry } from '@/features/instance/applications/context/fileEntry';
import { isDirectory } from '@/features/instance/applications/context/isDirectory';
import { useEditorView } from '@/features/instance/applications/hooks/useEditorView';
import { useRenameFile } from '@/features/instance/applications/hooks/useRenameFile';
import { useCallback, useEffect, useMemo } from 'react';
import { ControlledTreeEnvironment, Tree, TreeItem } from 'react-complex-tree';
import './file-explorer-modern.css';
import { FileTypeIcon } from './FileTreeExplorer/FileTypeIcon';

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

	// TODO: Split all this logic up into smaller files, right?

	// TODO: keyboard shortcuts when the editor isn't focused (creating files and folders, deleting, can we
	//  copy-cut-paste selections?)
	// TODO: keyboard shortcut for deleting a file?
	// TODO: stick packages under a different top level node // package-locked-icon fas fa-lock ml-2
	// TODO: icon showing package is read-only

	// TODO: new application
	// TODO: import application
	// TODO: restore focus after closing a modal (to the editor or the file tree)

	// TODO: context menu when right click on tree

	// TODO: on drag item from one folder to another
	// TODO: on drop file or folder from outside the editor to upload stuff rapidly
	// TODO: open file after creating it
	// TODO: select folder after creating it

	const renameFile = useRenameFile();
	const onRenameItem = useCallback((item: TreeItem<FileEntry | DirectoryEntry | null>, name: string) => renameFile(item.data, name), [renameFile]);

	return (
		<div className="h-full overflow-auto pr-1.5">
			<ControlledTreeEnvironment
				items={items}
				getItemTitle={(item) => getItemTitle(item)}
				canDragAndDrop={true}
				canReorderItems={false}
				canSearch={true}
				onRenameItem={onRenameItem}
				renderItemTitle={({ title, item, context }) => {
					const data = item.data as DirectoryEntry | FileEntry | null;
					const isDir = isDirectory(data);
					const name = title;
					const ext = !isDir ? (name.includes('.') ? name.split('.').pop()?.toLowerCase() ?? null : null) : null;
					return (
						<>
							{isDir ? <DirectoryIcon opened={context.isExpanded} /> : <FileTypeIcon extension={ext} />}
							<span>{name}</span>
						</>
					);
				}}
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
			>
				<Tree treeId="applicationsTree" rootItem={rootId} treeLabel="Applications file tree" />
			</ControlledTreeEnvironment>
		</div>
	);
}
