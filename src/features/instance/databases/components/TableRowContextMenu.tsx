import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from '@/components/ui/contextMenu';
import { TableContextMenuItems } from '@/features/instance/databases/components/TableContextMenuItems';
import { InstanceDatabaseMap } from '@/integrations/api/api.patch';
import { ReactNode, useCallback, useState } from 'react';

/**
 * Wraps the database overview's table list so right-clicking a table row opens the same actions menu
 * as right-clicking that table in the sidebar tree. Resolves the clicked row from a `data-table-name`
 * attribute the caller puts on each row. `modal={false}` (as in the tree menu) keeps a menu-opened
 * Dialog from leaving `pointer-events: none` stuck on <body>.
 */
export function TableRowContextMenu({ databaseName, instanceDatabaseMap, children }: {
	databaseName: string;
	instanceDatabaseMap?: InstanceDatabaseMap;
	children: ReactNode;
}) {
	const [tableName, setTableName] = useState<string | undefined>(undefined);
	// Bumped to the cursor position on every right-click so the content remounts and re-anchors there
	// -- without it Radix leaves an already-open menu at its first position.
	const [anchorKey, setAnchorKey] = useState('');

	const onContextMenu = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
		const name = (event.target as HTMLElement).closest('[data-table-name]')?.getAttribute('data-table-name');
		if (!name) {
			setTableName(undefined);
			event.preventDefault();
			return;
		}
		setTableName(name);
		setAnchorKey(`${event.clientX},${event.clientY}`);
	}, []);

	return (
		<ContextMenu modal={false}>
			<ContextMenuTrigger asChild>
				<div onContextMenu={onContextMenu}>
					{children}
				</div>
			</ContextMenuTrigger>
			{tableName && (
				<ContextMenuContent
					key={anchorKey}
					className="min-w-44"
					onCloseAutoFocus={event => event.preventDefault()}
				>
					<TableContextMenuItems
						databaseName={databaseName}
						tableName={tableName}
						instanceDatabaseMap={instanceDatabaseMap}
					/>
				</ContextMenuContent>
			)}
		</ContextMenu>
	);
}
