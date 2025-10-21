import { buildItems } from '@/features/instance/applications/components/ApplicationsSidebar/buildItems';
import {
	DirectoryIcon,
} from '@/features/instance/applications/components/ApplicationsSidebar/FileTreeExplorer/DirectoryIcon';
import { getItemTitle } from '@/features/instance/applications/components/ApplicationsSidebar/getItemTitle';
import type { DirectoryEntry } from '@/features/instance/applications/context/directoryEntry';
import type { FileEntry } from '@/features/instance/applications/context/fileEntry';
import { isDirectory } from '@/features/instance/applications/context/isDirectory';
import { useEditorView } from '@/features/instance/applications/hooks/useEditorView';
import { useSessionStorage } from '@/hooks/useSessionStorage';
import { useParams } from '@tanstack/react-router';
import { useEffect, useMemo } from 'react';
import { ControlledTreeEnvironment, Tree } from 'react-complex-tree';
import './file-explorer-modern.css';
import { TreeItemIndex } from 'react-complex-tree/src/types';
import { FileTypeIcon } from './FileTreeExplorer/FileTypeIcon';

export function ApplicationsSidebar() {
	const { rootEntries, openedEntry, setOpenedEntry } = useEditorView();
	const { instanceId }: { instanceId: string } = useParams({ strict: false });

	const defaultFolderExpansions = rootEntries.filter(rootEntry => !rootEntry.package).map<TreeItemIndex>(rootEntry => rootEntry.name);
	const defaultFocusedItem = defaultFolderExpansions[0];
	const [focusedItem, setFocusedItem] = useSessionStorage(`FileFocused/${instanceId}` as 'FileFocused/{instanceId}', defaultFocusedItem);
	const [expandedItems, setExpandedItems] = useSessionStorage(`FolderOpened/${instanceId}` as 'FolderOpened/{instanceId}', defaultFolderExpansions);
	const [selectedItems, setSelectedItems] = useSessionStorage(`FileSelected/${instanceId}` as 'FileSelected/{instanceId}', [] as TreeItemIndex[]);

	const { items, rootId } = useMemo(() => buildItems(rootEntries), [rootEntries]);

	useEffect(() => {
		if (openedEntry?.path !== focusedItem && focusedItem) {
			const item = items[focusedItem];
			const entry = item?.data as DirectoryEntry | FileEntry | undefined;
			if (entry) {
				setOpenedEntry(entry);
			}
		}
	}, [openedEntry, focusedItem, items]);

	// TODO: FAB in bottom right for actions
	// TODO: onRenameItem f2 handling
	// TODO: on drag item from one folder to another
	// TODO: save file
	// TODO: add file
	// TODO: add folder
	// TODO: delete file
	// TODO: delete folder
	// TODO: redeploy package
	// TODO: package is read-only
	// TODO: stick packages under a different top level node
	// TODO: restart cluster
	// TODO: on drop file or folder from outside the editor to upload stuff rapidly
	// TODO: context menu right click
	return (
		<div className="h-full overflow-auto pr-1.5">
			<ControlledTreeEnvironment
				items={items}
				getItemTitle={(item) => getItemTitle(item)}
				canDragAndDrop={true}
				canReorderItems={false}
				canSearch={true}
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
