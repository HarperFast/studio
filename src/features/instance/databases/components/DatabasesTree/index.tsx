import { ItemArrow } from '@/features/instance/applications/components/ApplicationsSidebar/ItemArrow';
import '@/features/instance/applications/components/ApplicationsSidebar/file-explorer-modern.css';
import { useInstanceBrowseManagePermission } from '@/hooks/usePermissions';
import { InstanceDatabaseMap } from '@/integrations/api/api.patch';
import { setWatchedValue } from '@/lib/events/watcher';
import { buildAbsoluteLinkToDatabasePage } from '@/lib/urls/buildAbsoluteLinkToDatabasePage';
import { useNavigate, useParams } from '@tanstack/react-router';
import { CSSProperties, useCallback, useMemo } from 'react';
import { ControlledTreeEnvironment, InteractionMode, Tree, TreeItemIndex } from 'react-complex-tree';
import { buildItems, DbTreeData } from './buildItems';
import { DatabaseTreeContextMenu } from './DatabaseTreeContextMenu';
import { getItemTitle } from './getItemTitle';
import { ItemTitle } from './ItemTitle';
import { useDatabaseTreeViewState } from './useDatabaseTreeViewState';

// The shared `.app-tree-scroll` styling insets the scrollbar for the applications drop target; the
// databases tree has none, so zero it out.
const scrollStyle = { '--rct-drop-target-height': '0px' } as CSSProperties;

export function DatabasesTree({ instanceDatabaseMap }: { instanceDatabaseMap?: InstanceDatabaseMap }) {
	const params: {
		clusterId?: string;
		instanceId?: string;
		organizationId?: string;
		databaseName?: string;
		tableName?: string;
	} = useParams({ strict: false });
	const navigate = useNavigate();
	const canManage = useInstanceBrowseManagePermission();

	const { items, rootId } = useMemo(
		() => buildItems(instanceDatabaseMap, { canManage }),
		[instanceDatabaseMap, canManage],
	);
	const { focusedItem, setFocusedItem, expandedItems, setExpandedItems, selectedItems } = useDatabaseTreeViewState(
		params,
	);

	const goTo = useCallback((databaseName?: string, tableName?: string) => {
		void navigate({ to: buildAbsoluteLinkToDatabasePage({ ...params, databaseName, tableName }) });
	}, [navigate, params]);

	// Single-click "selects" a row (see DoubleClickItemToExpandInteractionManager): a database navigates
	// to its overview, a table to its data grid, and the synthetic row opens the create-table modal.
	const onActivateItem = useCallback((data: DbTreeData) => {
		switch (data.kind) {
			case 'createTable':
				setWatchedValue('ShowCreateTable', { databaseName: params.databaseName });
				break;
			case 'database':
				if (params.databaseName !== data.databaseName || params.tableName) {
					goTo(data.databaseName, undefined);
				}
				break;
			case 'table':
				if (params.databaseName !== data.databaseName || params.tableName !== data.tableName) {
					goTo(data.databaseName, data.tableName);
				}
				break;
		}
	}, [params.databaseName, params.tableName, goTo]);

	const onSelectItems = useCallback((selected: TreeItemIndex[]) => {
		const id = selected[selected.length - 1];
		const data = id !== undefined ? items[id]?.data : undefined;
		if (data) {
			onActivateItem(data);
		}
	}, [items, onActivateItem]);

	return (
		<div className="app-tree-scroll h-full overflow-auto pr-1.5" style={scrollStyle}>
			<DatabaseTreeContextMenu items={items} instanceDatabaseMap={instanceDatabaseMap}>
				<ControlledTreeEnvironment
					canDragAndDrop={false}
					canReorderItems={false}
					canSearch={true}
					canRename={false}
					defaultInteractionMode={InteractionMode.DoubleClickItemToExpand}
					getItemTitle={getItemTitle}
					items={items}
					renderItemArrow={ItemArrow}
					renderItemTitle={ItemTitle}
					viewState={{ databasesTree: { focusedItem, expandedItems, selectedItems } }}
					onFocusItem={item => setFocusedItem(item.index)}
					onExpandItem={item => setExpandedItems(prev => (prev.includes(item.index) ? prev : [...prev, item.index]))}
					onCollapseItem={item => setExpandedItems(prev => prev.filter(index => index !== item.index))}
					onSelectItems={onSelectItems}
				>
					<Tree treeId="databasesTree" rootItem={rootId} treeLabel="Databases tree" />
				</ControlledTreeEnvironment>
			</DatabaseTreeContextMenu>
		</div>
	);
}
