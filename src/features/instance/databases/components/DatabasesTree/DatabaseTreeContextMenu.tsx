import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from '@/components/ui/contextMenu';
import { TableContextMenuItems } from '@/features/instance/databases/components/TableContextMenuItems';
import { useInstanceBrowseManagePermission } from '@/hooks/usePermissions';
import { InstanceDatabaseMap } from '@/integrations/api/api.patch';
import { setWatchedValue } from '@/lib/events/watcher';
import { PlusIcon, Trash2Icon } from 'lucide-react';
import { ReactNode, useCallback, useState } from 'react';
import type { TreeItem } from 'react-complex-tree';
import type { DbTreeData } from './buildItems';

/**
 * Right-click menu for the databases tree. Resolves the clicked row from `data-rct-item-id`, remembers
 * it as the target, and fires the shared target-carrying watched values (reusing the same modals the
 * toolbar uses). Table rows share their action list with the overview via `TableContextMenuItems`.
 * `modal={false}` is load-bearing -- every action opens a Dialog, and a modal menu would leave
 * `pointer-events: none` stuck on <body>, freezing the page.
 */
export function DatabaseTreeContextMenu({ items, instanceDatabaseMap, children }: {
	items: Record<string, TreeItem<DbTreeData>>;
	instanceDatabaseMap?: InstanceDatabaseMap;
	children: ReactNode;
}) {
	const canManage = useInstanceBrowseManagePermission();
	const [target, setTarget] = useState<DbTreeData | undefined>(undefined);
	// Bumped to the cursor position on every right-click so the content remounts and re-anchors there
	// -- without it Radix leaves an already-open menu at its first position.
	const [anchorKey, setAnchorKey] = useState('');

	const onContextMenu = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
		const id = (event.target as HTMLElement).closest('[data-rct-item-id]')?.getAttribute('data-rct-item-id');
		const data = id ? items[id]?.data : undefined;
		// Suppress on empty space / the synthetic root + create-table rows. Clearing the target keeps a
		// stale menu from flashing if the open-on-right-click still fires with nothing to show.
		if (!data || data.kind === 'root' || data.kind === 'createTable') {
			setTarget(undefined);
			event.preventDefault();
			return;
		}
		setTarget(data);
		setAnchorKey(`${event.clientX},${event.clientY}`);
	}, [items]);

	return (
		<ContextMenu modal={false}>
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
					{target.kind === 'database' && canManage && (
						<>
							<ContextMenuItem
								onSelect={() => setWatchedValue('ShowCreateTable', { databaseName: target.databaseName })}
							>
								<PlusIcon />
								Create a Table
							</ContextMenuItem>
							<ContextMenuSeparator />
							<ContextMenuItem
								variant="destructive"
								onSelect={() => setWatchedValue('ShowDeleteDatabase', { databaseName: target.databaseName })}
							>
								<Trash2Icon />
								Drop Database
							</ContextMenuItem>
						</>
					)}

					{target.kind === 'table' && (
						<TableContextMenuItems
							databaseName={target.databaseName}
							tableName={target.tableName}
							instanceDatabaseMap={instanceDatabaseMap}
						/>
					)}
				</ContextMenuContent>
			)}
		</ContextMenu>
	);
}
