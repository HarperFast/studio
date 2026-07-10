import { ContextMenuItem, ContextMenuSeparator } from '@/components/ui/contextMenu';
import { formatBrowseDataTableHeader } from '@/features/instance/databases/functions/formatBrowseDataTableHeader';
import { useExportTableCsv } from '@/features/instance/databases/hooks/useExportTableCsv';
import { useInstanceBrowseManagePermission, useInstanceSchemaTablePermission } from '@/hooks/usePermissions';
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
	const { exportCsv } = useExportTableCsv();

	const isLastTable = Object.keys(instanceDatabaseMap?.[databaseName] || {}).length <= 1;

	const onExport = () => {
		const { primaryKey } = formatBrowseDataTableHeader(instanceDatabaseMap?.[databaseName]?.[tableName]);
		void exportCsv({ databaseName, tableName, primaryKey, conditions: null });
	};

	return (
		<>
			{canInsert && (
				<ContextMenuItem onSelect={() => setWatchedValue('ShowAddTableRecords', { databaseName, tableName })}>
					<PlusIcon />
					Add New Record(s)
				</ContextMenuItem>
			)}
			{canInsert && (
				<ContextMenuItem onSelect={() => setWatchedValue('ShowImportData', { databaseName, tableName })}>
					<CloudUploadIcon />
					Import Data
				</ContextMenuItem>
			)}
			<ContextMenuItem onSelect={onExport}>
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
