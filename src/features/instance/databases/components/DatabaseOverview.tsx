import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdownMenu';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { TableRowContextMenu } from '@/features/instance/databases/components/TableRowContextMenu';
import { useInstanceBrowseManagePermission, useInstanceImportOperationsPermission } from '@/hooks/usePermissions';
import { InstanceDatabaseMap } from '@/integrations/api/api.patch';
import { getDescribeTableQueryOptions } from '@/integrations/api/instance/database/getDescribeTable';
import { setWatchedValue } from '@/lib/events/watcher';
import { formatValue } from '@/lib/formatValue';
import { buildAbsoluteLinkToDatabasePage } from '@/lib/urls/buildAbsoluteLinkToDatabasePage';
import { useQueries } from '@tanstack/react-query';
import { useNavigate, useParams } from '@tanstack/react-router';
import { CloudUploadIcon, EllipsisIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { useCallback } from 'react';

/** One byte-format path for every chart — see src/lib/formatValue.ts. */
const formatBytes = (bytes: number) => formatValue(bytes, 'bytes-si');

function Stat({ label, value }: { label: string; value: string }) {
	return (
		<div className="rounded-md border border-border dark:border-grey-700 p-4">
			<div className="text-sm text-muted-foreground">{label}</div>
			<div className="text-2xl font-medium">{value}</div>
		</div>
	);
}

export function DatabaseOverview({ instanceDatabaseMap, databaseName }: {
	instanceDatabaseMap?: InstanceDatabaseMap;
	databaseName: string;
}) {
	const params: {
		clusterId?: string;
		instanceId?: string;
		organizationId?: string;
	} = useParams({ strict: false });
	const navigate = useNavigate();
	const instanceParams = useInstanceClientIdParams();
	const canManage = useInstanceBrowseManagePermission();
	const canImport = useInstanceImportOperationsPermission();

	const tables = instanceDatabaseMap?.[databaseName] ?? {};
	const tableNames = Object.keys(tables).sort();

	// Sizes/schema are already in the fast (count-skipping) map, so they render instantly. Row counts
	// aren't, so fetch them per-table via describe_table's cheap estimate path -- but only for the
	// tables in THIS database, not the whole instance. These share React Query's cache with the table
	// view, so counts stay consistent and opening a table is instant.
	const countQueries = useQueries({
		queries: tableNames.map((tableName) =>
			getDescribeTableQueryOptions({ ...instanceParams, databaseName, tableName })
		),
	});
	const countByTable: Record<string, { recordCount?: number; estimated: boolean }> = {};
	tableNames.forEach((tableName, index) => {
		const data = countQueries[index]?.data;
		if (data) {
			countByTable[tableName] = { recordCount: data.record_count, estimated: !!data.estimated_record_range };
		}
	});
	// Settled, not "has data": describe_table uses retry:false, so a single failed/never-resolving count
	// would otherwise hang the total on "…" forever even though every other table counted fine. Sum the
	// ones that resolved, and flag the total as an estimate if any contributing count was estimated.
	const allCountsSettled = countQueries.every((query) => !query.isPending);
	const anyEstimated = tableNames.some((tableName) => countByTable[tableName]?.estimated);

	// Every table in a database shares the same underlying store, so db_size/db_audit_size are the same
	// on each -- read them off any table.
	const anyTable = tableNames.length ? tables[tableNames[0]] : undefined;
	const dbSize = anyTable?.db_size ?? 0;
	const auditSize = anyTable?.db_audit_size ?? 0;
	const totalRecords = allCountsSettled
		? tableNames.reduce((sum, tableName) => sum + (countByTable[tableName]?.recordCount ?? 0), 0)
		: undefined;

	const goToTable = useCallback((tableName: string) => {
		void navigate({ to: buildAbsoluteLinkToDatabasePage({ ...params, databaseName, tableName }) });
	}, [navigate, params, databaseName]);

	return (
		<div className="pt-15 pb-4 pr-4">
			<div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 pb-6">
				<div className="flex items-center gap-2 min-w-0">
					<h1 className="text-3xl truncate">{databaseName}</h1>
				</div>
				{canManage && (
					<div className="flex space-x-2 shrink-0">
						<Button
							variant="positiveOutline"
							onClick={() => setWatchedValue('ShowCreateTable', { databaseName })}
						>
							<PlusIcon />
							<span>Create a Table</span>
						</Button>
						{canImport && (
							<Button
								variant="positiveOutline"
								onClick={() => setWatchedValue('ShowImportData', { databaseName })}
							>
								<CloudUploadIcon />
								<span>Import Data</span>
							</Button>
						)}
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button variant="ghost" size="icon">
									<EllipsisIcon aria-label="Database options" />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent side="bottom" align="end">
								<DropdownMenuItem
									className="focus:bg-red/70 focus:text-white"
									onClick={() => setWatchedValue('ShowDeleteDatabase', { databaseName })}
								>
									<Trash2Icon />
									Drop Database
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					</div>
				)}
			</div>

			<div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pb-6">
				<Stat label="Tables" value={tableNames.length.toLocaleString()} />
				<Stat
					label="Records"
					value={totalRecords === undefined ? '…' : `${anyEstimated ? '~' : ''}${totalRecords.toLocaleString()}`}
				/>
				<Stat label="Size" value={formatBytes(dbSize)} />
				<Stat label="Audit Size" value={formatBytes(auditSize)} />
			</div>

			{tableNames.length === 0
				? (
					<div className="rounded-md border border-border dark:border-grey-700 p-8 text-center text-muted-foreground">
						<p className="pb-2">This database has no tables yet.</p>
						{canManage && <p>Use “Create a Table” above, or right-click the database in the sidebar.</p>}
					</div>
				)
				: (
					<TableRowContextMenu databaseName={databaseName} instanceDatabaseMap={instanceDatabaseMap}>
						<div className="rounded-md border border-border dark:border-grey-700 overflow-x-auto">
							<table className="w-full text-sm">
								<thead>
									<tr className="text-left text-muted-foreground border-b border-border dark:border-grey-700">
										<th className="p-3 font-medium">Table</th>
										<th className="p-3 font-medium text-right">Records</th>
										<th className="p-3 font-medium text-right">Size</th>
										<th className="p-3 font-medium text-right">Columns</th>
										<th className="p-3 font-medium">Primary Key</th>
										<th className="p-3 font-medium">Last Updated</th>
									</tr>
								</thead>
								<tbody>
									{tableNames.map((tableName) => {
										const table = tables[tableName];
										const counted = countByTable[tableName];
										const primaryKey = table.primary_key ?? table.hash_attribute ?? '—';
										const recordLabel = counted?.recordCount === undefined
											? '…'
											: `${counted.estimated ? '~' : ''}${counted.recordCount.toLocaleString()}`;
										return (
											<tr
												key={tableName}
												data-table-name={tableName}
												onClick={() => goToTable(tableName)}
												className="border-b border-border dark:border-grey-700 last:border-0 cursor-pointer hover:bg-accent dark:hover:bg-grey-700/80"
											>
												<td className="p-3 font-medium">{tableName}</td>
												<td className="p-3 text-right tabular-nums">{recordLabel}</td>
												<td className="p-3 text-right tabular-nums">{formatBytes(table.table_size ?? 0)}</td>
												<td className="p-3 text-right tabular-nums">{table.attributes.length.toLocaleString()}</td>
												<td className="p-3">{primaryKey}</td>
												<td className="p-3 text-muted-foreground">
													{table.last_updated_record
														? new Date(table.last_updated_record).toLocaleString()
														: '—'}
												</td>
											</tr>
										);
									})}
								</tbody>
							</table>
						</div>
					</TableRowContextMenu>
				)}
		</div>
	);
}
