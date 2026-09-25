import { ContextMenuItem, ContextMenuSeparator } from '@/components/ui/contextMenu';
import { formatBrowseDataTableHeader } from '@/features/instance/databases/functions/formatBrowseDataTableHeader';
import { useExportTableCsv } from '@/features/instance/databases/hooks/useExportTableCsv';
import {
	useInstanceBrowseManagePermission,
	useInstanceImportDataPermission,
	useInstanceSchemaTablePermission,
} from '@/hooks/usePermissions';
import { InstanceDatabaseMap } from '@/integrations/api/api.patch';
import { setWatchedValue } from '@/lib/events/watcher';
import { useParams } from '@tanstack/react-router';
import { CloudDownloadIcon, CloudUploadIcon, PlusIcon, TrashIcon } from 'lucide-react';

/**
 * The per-table right-click actions (Add Records / Import / Export CSV / Drop Table), shared by the
 * sidebar tree and the database overview's table list so both menus stay identical. Fires the same
 * target-carrying watched values the toolbar uses; Export runs the shared CSV hook directly.
 * Renders only `ContextMenuItem`s, so it must live inside a `ContextMenuContent`.
 */
export function TableContextMenuItems({ databaseName, tableName, instanceDatabaseMap }: {
	databaseName: string;
	tableName: string;
	instanceDatabaseMap?: InstanceDatabaseMap;
}) {
	const { clusterId, instanceId }: { clusterId?: string; instanceId?: string } = useParams({ strict: false });
	const canManage = useInstanceBrowseManagePermission();
	const canInsert = useInstanceSchemaTablePermission(instanceId ?? clusterId, databaseName, tableName, 'insert');
	const canImport = useInstanceImportDataPermission(instanceId ?? clusterId, databaseName, tableName);
	const { exportCsv } = useExportTableCsv();

	const isLastTable = Object.keys(instanceDatabaseMap?.[databaseName] || {}).length <= 1;
	const instanceTable = instanceDatabaseMap?.[databaseName]?.[tableName];
	// Same withdrawal as the table view's toolbar: rows added here couldn't be listed there.
	const hasPrimaryKey = !instanceTable || !!(instanceTable.primary_key ?? instanceTable.hash_attribute);

	const onExport = () => {
		const { primaryKey } = formatBrowseDataTableHeader(instanceTable);
		void exportCsv({ databaseName, tableName, primaryKey, conditions: null });
	};

	return (
		<>
			{canInsert && hasPrimaryKey && (
				<ContextMenuItem onSelect={() => setWatchedValue('ShowAddTableRecords', { databaseName, tableName })}>
					<PlusIcon />
					Add New Record(s)
				</ContextMenuItem>
			)}
			{canImport && hasPrimaryKey && (
				<ContextMenuItem onSelect={() => setWatchedValue('ShowImportData', { databaseName, tableName })}>
					<CloudUploadIcon />
					Import Data
				</ContextMenuItem>
			)}
			<ContextMenuItem onSelect={onExport} disabled={!hasPrimaryKey}>
				<CloudDownloadIcon />
				Export CSV
			</ContextMenuItem>
			{canManage && !isLastTable && (
				<>
					<ContextMenuSeparator />
					<ContextMenuItem
						variant="destructive"
						onSelect={() => setWatchedValue('ShowDeleteTable', { databaseName, tableName })}
					>
						<TrashIcon />
						Drop Table
					</ContextMenuItem>
				</>
			)}
		</>
	);
}
