import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdownMenu';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { formatBrowseDataTableHeader } from '@/features/instance/databases/functions/formatBrowseDataTableHeader';
import { AddTableRowModal } from '@/features/instance/databases/modals/AddTableRowModal';
import { DeleteDatabaseModal } from '@/features/instance/databases/modals/DeleteDatabaseModal';
import { DeleteTableModal } from '@/features/instance/databases/modals/DeleteTableModal';
import { EditTableRowModal } from '@/features/instance/databases/modals/EditTableRowModal';
import { ImportDataModal } from '@/features/instance/databases/modals/ImportDataModal';
import { useAdminMode } from '@/hooks/useAuth';
import { useEffectedState } from '@/hooks/useEffectedState';
import { useInstanceBrowseManagePermission, useInstanceSchemaTablePermission } from '@/hooks/usePermissions';
import { useRefreshClick } from '@/hooks/useRefreshClick';
import { useSessionStorage } from '@/hooks/useSessionStorage';
import { useToggler } from '@/hooks/useToggler';
import { InstanceDatabaseMap } from '@/integrations/api/api.patch';
import { useCleanupOrphanBlobsMutation } from '@/integrations/api/instance/database/cleanupOrphanBlobs';
import { useDeleteTableRecords } from '@/integrations/api/instance/database/deleteTableRecords';
import { getDescribeTableQueryOptions } from '@/integrations/api/instance/database/getDescribeTable';
import {
	getSearchByConditions,
	getSearchByConditionsOptions,
	SearchCondition,
	translateColumnFilterToSearchConditions,
} from '@/integrations/api/instance/database/getSearchByConditions';
import { getSearchByIdOptions } from '@/integrations/api/instance/database/getSearchById';
import { getSearchByValue, getSearchByValueOptions } from '@/integrations/api/instance/database/getSearchByValue';
import { getTableRecordCountQueryOptions } from '@/integrations/api/instance/database/getTableRecordCount';
import { useUpdateTableRecords } from '@/integrations/api/instance/database/updateTableRecords';
import { useSetWatchedValue } from '@/lib/events/watcher';
import { keyBy } from '@/lib/keyBy';
import { onClickStopPropagation } from '@/lib/onClickStopPropagation';
import { buildAbsoluteLinkToDatabasePage } from '@/lib/urls/buildAbsoluteLinkToDatabasePage';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { Row, VisibilityState } from '@tanstack/react-table';
import {
	BrushCleaningIcon,
	CircleCheckBigIcon,
	CircleIcon,
	CloudDownloadIcon,
	CloudUploadIcon,
	EllipsisIcon,
	ExternalLinkIcon,
	FunnelIcon,
	FunnelPlusIcon,
	FunnelXIcon,
	PlusIcon,
	RefreshCwIcon,
	Trash2Icon,
	TrashIcon,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { ColumnFiltersSchema } from './ColumnFilters';
import { PickColumnsDropdown } from './PickColumnsDropdown';
import { TableView } from './TableView';

export function DatabaseTableView({ instanceDatabaseMap, databaseName, tableName }: {
	instanceDatabaseMap?: InstanceDatabaseMap;
	databaseName: string;
	tableName: string;
}) {
	const allParams: {
		clusterId?: string;
		instanceId?: string;
	} = useParams({ strict: false });

	const navigate = useNavigate();
	const instanceParams = useInstanceClientIdParams();
	const { clusterId, instanceId } = allParams;

	const { toggled: onlyIfCached, toggle: toggleOnlyCached } = useToggler(true);

	const adminMode = useAdminMode();
	const canAddRecords = useInstanceSchemaTablePermission(instanceId ?? clusterId, databaseName, tableName, 'insert');
	const canEditRecords = useInstanceSchemaTablePermission(instanceId ?? clusterId, databaseName, tableName, 'update');
	const canDeleteRecords = useInstanceSchemaTablePermission(instanceId ?? clusterId, databaseName, tableName, 'delete');
	const canManageBrowseInstance = useInstanceBrowseManagePermission();

	const { data: describeTableData } = useQuery(
		getDescribeTableQueryOptions({
			...instanceParams,
			databaseName,
			tableName,
		}),
	);
	// describe_all (which feeds `instanceDatabaseMap`) is fetched without record counts so it returns fast;
	// describe_table backfills this table's count asynchronously. Render schema from whichever arrives first
	// -- the map is usually ready before describe_table -- so columns and records are never gated on the
	// (slower) count scan. describe_table wins once present: it's the per-table, refresh-invalidated copy.
	const tableFromMap = instanceDatabaseMap?.[databaseName]?.[tableName];
	const instanceTable = describeTableData ?? tableFromMap;
	const attributesMap = useMemo(() => keyBy(instanceTable?.attributes ?? [], 'attribute'), [instanceTable]);
	const [selectedIds, setSelectedIds] = useEffectedState<null | unknown[]>(null, allParams);
	const [isEditModalOpen, setIsEditModalOpen] = useState(false);

	const isLastTableInDatabase = useMemo(() => {
		const tableNames = databaseName ? Object.keys(instanceDatabaseMap?.[databaseName] || []).sort() : [];
		return tableNames.length === 1;
	}, [instanceDatabaseMap, databaseName]);

	const { toggled: filtersToggled, toggleOn: showFilters, toggleOff: hideFilters } = useToggler(false);
	const columnFiltersForm = useForm({
		resolver: zodResolver(ColumnFiltersSchema),
	});
	const { reset: resetFiltersForm } = columnFiltersForm;
	const columnFiltersValues = columnFiltersForm.watch();

	const [appliedSearchConditions, setAppliedSearchConditions] = useEffectedState<SearchCondition[] | null>(null, [
		allParams.clusterId,
		allParams.instanceId,
		databaseName,
		tableName,
	]);

	const applyFilters = useCallback(() => {
		const conditions: SearchCondition[] = [];
		for (const key in columnFiltersValues) {
			if (columnFiltersValues[key]?.length) {
				try {
					conditions.push(
						...translateColumnFilterToSearchConditions(key, columnFiltersValues[key], attributesMap[key]),
					);
				} catch (err) {
					toast.error(String(err));
				}
			}
		}
		setAppliedSearchConditions(conditions.length ? conditions : null);
		resetFiltersForm({ ...columnFiltersValues });
	}, [attributesMap, resetFiltersForm, columnFiltersValues]);
	const clearFilters = useCallback(() => {
		// Note sure why we need to resetFiltersForm twice here...
		resetFiltersForm({}, { keepValues: false, keepDirtyValues: false, keepDefaultValues: false });
		resetFiltersForm();
		setAppliedSearchConditions(null);
		hideFilters();
	}, [hideFilters, resetFiltersForm]);

	useEffect(function clearFiltersWhenParamsChange() {
		return clearFilters();
	}, [allParams, clearFilters]);

	const { dataTableColumns, primaryKey } = formatBrowseDataTableHeader(instanceTable);
	const [isAddModalOpen, setIsAddModalOpen] = useState(false);
	const [isImportDataModalOpen, setIsImportDataModalOpen] = useState(false);
	const [sort, setSort] = useEffectedState(
		{
			attribute: primaryKey,
			descending: false,
		},
		allParams,
	);

	const [pageIndex, setPageIndex] = useEffectedState(0, [databaseName, tableName]);
	const [pageSize, setPageSize] = useState(20);

	// The count comes from whichever describe carries it: the map when the server still returns counts
	// (older backends), otherwise describe_table's async backfill. The first pass is always the cheap
	// estimate (a plain describe_table caps the count scan at ~500ms); the server returns an exact value
	// for small tables (no `estimated_record_range`) and a rounded estimate + range for large ones.
	const estimatedCount = describeTableData?.record_count ?? tableFromMap?.record_count;
	const estimatedRange = describeTableData?.estimated_record_range ?? tableFromMap?.estimated_record_range;

	// Exact count is opt-in: it forces a full, unbounded scan, so we only run it when the user asks for
	// it from the pagination tooltip. Reset the request when the table changes.
	const [wantExactCount, setWantExactCount] = useEffectedState(false, [databaseName, tableName]);
	const { data: exactCount, isFetching: isExactCountFetching, isError: isExactCountError, refetch: refetchExactCount } =
		useQuery(
			getTableRecordCountQueryOptions({ ...instanceParams, enabled: wantExactCount, databaseName, tableName }),
		);
	// First click enables the (initially disabled) query; later clicks retry a failed fetch via refetch.
	const requestExactCount = useCallback(() => {
		if (wantExactCount) {
			void refetchExactCount();
		} else {
			setWantExactCount(true);
		}
	}, [wantExactCount, refetchExactCount, setWantExactCount]);

	const totalRecords = exactCount ?? estimatedCount;
	const totalPages = totalRecords ? Math.ceil(totalRecords / pageSize) : 0;
	// A count is approximate only while we're still showing the estimate and the server flagged it as one.
	const isEstimatedCount = exactCount === undefined && estimatedRange !== undefined;

	const useFilteredList = filtersToggled && !!appliedSearchConditions;

	// Full list
	const searchByValueParams = {
		...instanceParams,
		enabled: !useFilteredList && !!primaryKey,
		databaseName,
		tableName,
		searchAttribute: primaryKey,
		sort,
		pageSize,
		pageIndex,
		onlyIfCached,
	};
	const searchByValueOptions = getSearchByValueOptions(searchByValueParams);
	const { data: fullTableData, isFetching: tableDataFetching } = useQuery(searchByValueOptions);

	// Filtered list
	const searchByConditionsParams = {
		...instanceParams,
		enabled: useFilteredList && !!primaryKey,
		databaseName,
		tableName,
		conditions: appliedSearchConditions,
		sort,
		pageSize,
		pageIndex,
		onlyIfCached,
	};
	const searchByConditionsOptions = getSearchByConditionsOptions(searchByConditionsParams);
	const { data: filteredTableData, isFetching: tableConditionsDataFetching } = useQuery(searchByConditionsOptions);

	const tableData = useFilteredList ? filteredTableData : fullTableData;
	const isFetching = tableDataFetching || tableConditionsDataFetching;

	// One by id
	const { data: searchByIdData } = useQuery(getSearchByIdOptions({
		...instanceParams,
		enabled: isEditModalOpen,
		databaseName: databaseName,
		tableName: tableName,
		ids: selectedIds,
	}));

	const { mutate: updateTableRecords, isPending: isUpdateTableRecordsPending } = useUpdateTableRecords();
	const { mutate: deleteTableRecords, isPending: isDeleteTableRecordsPending } = useDeleteTableRecords();
	const { mutate: cleanupOrphanBlobs, isPending: isCleanupOrphanBlobsPending } = useCleanupOrphanBlobsMutation();

	const queryClient = useQueryClient();
	const refreshTable = useCallback(
		() => queryClient.invalidateQueries({ queryKey: [instanceParams.entityId, databaseName, tableName] }),
		[queryClient, instanceParams.entityId, databaseName, tableName],
	);

	const onCleanupOrphanBlobs = useCallback(async () => {
		if (!confirm(`Are you sure you want to cleanup orphan blobs for database "${databaseName}"?`)) {
			return;
		}

		cleanupOrphanBlobs({
			...instanceParams,
			databaseName,
		}, {
			onSuccess: (data) => {
				toast.success(data.message || 'Orphan blobs cleanup started successfully');
				refreshTable();
			},
			onError: (error) => {
				toast.error(error instanceof Error ? error.message : 'Failed to cleanup orphan blobs');
			},
		});
	}, [cleanupOrphanBlobs, databaseName, instanceParams, refreshTable]);

	const [isExportingCSV, setisExportingCSV] = useState(false);
	const onExportCSVClicked = useCallback(async () => {
		if (!primaryKey) {
			return;
		}
		const id = toast.loading('Loading CSV...');
		setisExportingCSV(true);
		const allResultsAsCSV = {
			pageIndex: 0,
			pageSize: 1_000_000,
			headers: {
				Accept: 'text/csv',
			},
		};
		const response = await (
			useFilteredList
				? getSearchByConditions({ ...searchByConditionsParams, ...allResultsAsCSV })
				: getSearchByValue({ ...searchByValueParams, ...allResultsAsCSV })
		);
		toast.loading('Preparing CSV...', { id });
		const content = response.data as unknown as string;
		const blob = new Blob([content], { type: 'text/csv' });
		const url = URL.createObjectURL(blob);
		const downloadLink = document.createElement('a');
		downloadLink.href = url;
		downloadLink.setAttribute('download', `${databaseName}.${tableName}.${new Date().toISOString()}.csv`);
		downloadLink.click();
		toast.success('CSV Exported!', { id });
		setisExportingCSV(false);
	}, [databaseName, tableName, searchByValueOptions, searchByConditionsOptions]);

	const onRecordUpdate = useCallback((data: Record<string, unknown>[]) => {
		updateTableRecords(
			{
				...instanceParams,
				databaseName,
				tableName,
				records: data,
			},
			{
				onSuccess: () => {
					void refreshTable();
					setIsEditModalOpen(false);
					toast.success('Record updated successfully');
				},
			},
		);
	}, [updateTableRecords, instanceParams, databaseName, tableName, refreshTable]);

	const onDeleteRecord = useCallback((hashes: unknown[]) => {
		deleteTableRecords(
			{
				...instanceParams,
				databaseName,
				tableName,
				hashValues: hashes,
			},
			{
				onSuccess: () => {
					void refreshTable();
					setIsEditModalOpen(false);
					toast.success('Record deleted successfully');
				},
			},
		);
	}, [deleteTableRecords, instanceParams, databaseName, tableName, refreshTable]);

	const onImported = useCallback(async (importedDatabase: string, importedTable: string) => {
		// The import may have created a new table (or even database), so refresh the tree too.
		await queryClient.invalidateQueries({
			queryKey: [instanceParams.entityId, 'describe_all'],
			refetchType: 'all',
		});
		if (importedDatabase === databaseName && importedTable === tableName) {
			void refreshTable();
		} else {
			void navigate({
				to: buildAbsoluteLinkToDatabasePage({
					...allParams,
					databaseName: importedDatabase,
					tableName: importedTable,
				}),
			});
		}
	}, [queryClient, instanceParams.entityId, databaseName, tableName, refreshTable, navigate, allParams]);

	const onRowClick = (rowData: Row<Record<string, unknown>>) => {
		setSelectedIds([rowData.original[primaryKey]]);
		setIsEditModalOpen(!isEditModalOpen);
	};
	const onColumnClick = (accessorKey: string, isAscending: boolean) => {
		setSort({
			attribute: accessorKey,
			descending: !isAscending,
		});
	};
	const onRefreshClick = useRefreshClick(refreshTable);

	const onAddClicked = useCallback(() => {
		setIsAddModalOpen(true);
	}, [setIsAddModalOpen]);

	const onImportDataClicked = useCallback(() => {
		setIsImportDataModalOpen(true);
	}, [setIsImportDataModalOpen]);

	const onDeleted = useCallback(
		(deleted: 'table' | 'database') => void navigate({ to: deleted === 'table' ? '../' : '../../' }),
		[navigate],
	);

	const [columnVisibility, setColumnVisibility] = useSessionStorage(
		`ColumnDisplayed/${databaseName}/${tableName}` as 'ColumnDisplayed/{database}/{table}',
		{} satisfies VisibilityState,
	);

	const openDeleteTable = useSetWatchedValue('ShowDeleteTable', true);
	const openDeleteDatabase = useSetWatchedValue('ShowDeleteDatabase', true);

	return (
		<>
			<div className="flex flex-col md:flex-row items-center justify-between space-y-3 md:space-y-0 md:space-x-3 pt-15 pb-4 pr-4">
				<div className="flex space-x-2">
					{canAddRecords && (
						<Button
							variant="positiveOutline"
							onClick={onAddClicked}
							disabled={isAddModalOpen}
							accessKey="n"
						>
							<PlusIcon />
							<span>
								Add <u>N</u>ew Record(s)
							</span>
						</Button>
					)}
					{canAddRecords && (
						<Button
							variant="positiveOutline"
							onClick={onImportDataClicked}
							disabled={isImportDataModalOpen}
							accessKey="i"
						>
							<CloudUploadIcon />
							<span>
								<u>I</u>mport Data
							</span>
						</Button>
					)}
					<Button
						variant="positiveOutline"
						onClick={onExportCSVClicked}
						disabled={isExportingCSV}
						accessKey="e"
					>
						<CloudDownloadIcon />
						<span>
							<u>E</u>xport CSV
						</span>
					</Button>
				</div>

				<div className="flex space-x-2">
					{filtersToggled && appliedSearchConditions && (
						<Button type="button" variant="ghost" onClick={clearFilters} accessKey="f">
							<FunnelXIcon className="inline-block " />
							<span>
								Clear <u>F</u>ilters
							</span>
						</Button>
					)}
					{filtersToggled && columnFiltersForm.formState.isDirty && (
						<Button variant="default" onClick={applyFilters}>
							<FunnelPlusIcon className="inline-block " />
							Apply Filters
						</Button>
					)}
					{filtersToggled && !appliedSearchConditions && (
						<Button variant="ghost" onClick={hideFilters} accessKey="f">
							<FunnelXIcon className="inline-block " />
							<span>
								Hide <u>F</u>ilters
							</span>
						</Button>
					)}

					{!filtersToggled && (
						<Button variant="ghost" onClick={showFilters} accessKey="f">
							<FunnelIcon className="inline-block " />
							<span>
								Show <u>F</u>ilters
							</span>
						</Button>
					)}

					<Button
						variant="defaultOutline"
						onClick={onRefreshClick}
						disabled={isFetching}
					>
						<RefreshCwIcon />
					</Button>

					<PickColumnsDropdown
						columns={dataTableColumns}
						columnVisibility={columnVisibility}
						setColumnVisibility={setColumnVisibility}
					/>

					<DropdownMenu>
						<DropdownMenuTrigger asChild disabled={!instanceDatabaseMap}>
							<Button variant="ghost" size="icon" disabled={!instanceDatabaseMap}>
								<EllipsisIcon aria-label="Table options" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent side="bottom" align="end">
							<DropdownMenuItem className="focus:bg-primary/70 focus:text-white" onClick={toggleOnlyCached}>
								{onlyIfCached ? <CircleCheckBigIcon className="text-green" /> : <CircleIcon />}
								Only If Cached
								<Link
									to="https://docs.harperdb.io/docs/developers/applications/caching#cache-control-header"
									target="_blank"
									rel="noopener noreferrer"
									onClick={onClickStopPropagation}
								>
									<ExternalLinkIcon />
								</Link>
							</DropdownMenuItem>
							{canManageBrowseInstance
								&& adminMode
								&& !!instanceId && (
								<DropdownMenuItem
									className="focus:bg-yellow/70 focus:text-white"
									onClick={onCleanupOrphanBlobs}
									disabled={isCleanupOrphanBlobsPending}
								>
									<BrushCleaningIcon className="text-yellow " />
									Cleanup Orphan Blobs
								</DropdownMenuItem>
							)}
							{canManageBrowseInstance && !isLastTableInDatabase && (
								<DropdownMenuItem className="focus:bg-red/70 focus:text-white" onClick={openDeleteTable}>
									<TrashIcon className="inline-block " />
									Drop Table
								</DropdownMenuItem>
							)}
							{canManageBrowseInstance
								&& (
									<DropdownMenuItem className="focus:bg-red/70 focus:text-white" onClick={openDeleteDatabase}>
										<Trash2Icon />
										Drop Database
									</DropdownMenuItem>
								)}
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</div>

			<TableView<Record<string, unknown>, unknown>
				primaryKey={primaryKey}
				data={tableData?.data}
				isFetching={isFetching}
				filtersToggled={filtersToggled}
				columns={dataTableColumns}
				columnVisibility={columnVisibility}
				onRowClick={onRowClick}
				onColumnClick={onColumnClick}
				totalPages={totalPages}
				totalRecords={totalRecords}
				isEstimatedCount={isEstimatedCount}
				estimatedRange={estimatedRange}
				isExactCountFetching={isExactCountFetching}
				isExactCountError={isExactCountError}
				onRequestExactCount={requestExactCount}
				pageIndex={pageIndex}
				pageSize={pageSize}
				columnFiltersForm={columnFiltersForm}
				applyFilters={applyFilters}
				setPageIndex={setPageIndex}
				setPageSize={setPageSize}
			/>
			{canAddRecords && instanceTable && isAddModalOpen && (
				<AddTableRowModal
					instanceTable={instanceTable}
					isModalOpen={isAddModalOpen}
					refreshTable={refreshTable}
					setIsModalOpen={setIsAddModalOpen}
				/>
			)}
			<EditTableRowModal
				canEditRecords={canEditRecords}
				canDeleteRecords={canDeleteRecords}
				setIsModalOpen={setIsEditModalOpen}
				isModalOpen={isEditModalOpen}
				primaryKey={primaryKey}
				data={searchByIdData?.data}
				onSaveChanges={onRecordUpdate}
				onDeleteRecord={onDeleteRecord}
				isUpdateTableRecordsPending={isUpdateTableRecordsPending}
				isDeleteTableRecordsPending={isDeleteTableRecordsPending}
			/>

			<DeleteDatabaseModal databaseName={databaseName} onDeleted={onDeleted} />
			<DeleteTableModal databaseName={databaseName} tableName={tableName} onDeleted={onDeleted} />

			<ImportDataModal
				isModalOpen={isImportDataModalOpen}
				setIsModalOpen={setIsImportDataModalOpen}
				instanceDatabaseMap={instanceDatabaseMap}
				databaseName={databaseName}
				tableName={tableName}
				onImported={onImported}
			/>
		</>
	);
}
